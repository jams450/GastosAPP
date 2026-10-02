using System.Globalization;
using GastosApp.BusinessLogic.Models.Budgets;

namespace GastosApp.BusinessLogic.Services
{
    /// <summary>
    /// Reglas puras de matching de la sección 4.4 del plan. <b>Sin base de datos</b>: recibe pares
    /// <see cref="BudgetItemMatchInput"/> ya resueltos y devuelve la fuerza de cada uno. Toda la
    /// lógica decidible sin SQL vive aquí para que sea inspeccionable y comprobable por separado;
    /// el servicio solo carga, arma los pares, elige con <see cref="SelectBest"/> y escribe.
    /// </summary>
    /// <remarks>
    /// <para><b>La ventana es precondición común, no un extra de la regla fuerte.</b> El plan §4.4
    /// punto 1 la enuncia <i>antes</i> de la lista de fuerzas —"dentro de su ventana
    /// (<c>planned_date</c> → fin de mes) y que coincida, en este orden de fuerza"— así que tampoco
    /// la débil se concede fuera del periodo de la partida: un cargo anterior a
    /// <c>planned_date</c> es otro movimiento, no una ocurrencia de esa partida. La única
    /// relajación de la ventana es el pago tardío de un periodo ya cerrado
    /// (<see cref="IsLatePayment"/>).</para>
    /// <para>Orden de fuerza (plan §4.4 punto 1), de más fuerte a más débil:
    /// <list type="number">
    /// <item><b>Fuerte</b> — <c>merchant_id</c> igual <b>y</b> monto dentro de la tolerancia.</item>
    /// <item><b>Fuerte</b> — <c>account_id</c> + <c>category_id</c>/<c>subcategory_id</c> + monto exacto.</item>
    /// <item><b>Débil</b> — misma categoría/subcategoría y mismo mes. <b>Nunca</b> escribe.</item>
    /// </list>
    /// </para>
    /// </remarks>
    public static class BudgetItemMatcher
    {
        /// <summary>
        /// Fuerza de un par (partida, transacción). El <c>kind</c> y la ventana se evalúan aquí y no
        /// en el servicio: son parte de la regla, no de la carga de datos.
        /// </summary>
        /// <param name="input">El par evaluado.</param>
        /// <param name="tolerancePct"><c>Plan:MatchTolerancePct</c>: margen de monto de la regla fuerte por comercio.</param>
        /// <param name="periodIsClosed">
        /// <c>true</c> cuando el periodo de la partida ya está cerrado. Es la excepción a la ventana
        /// de la sección 4.4 punto 4: un pago que se atrasó sigue cumpliendo su partida y el mes
        /// cerrado pasa a <c>executed</c>. La excepción relaja el <b>tope</b> de la ventana, nunca el
        /// <b>piso</b> (<c>planned_date</c>), nunca el <b>kind</b> y nunca la <b>fuerza</b>: sin este
        /// flag, una partida de diciembre no enlazaría con un gasto de enero aunque coincidieran
        /// comercio y monto, y un pago tardío tampoco se concede por fuerza débil. La decisión de
        /// <i>qué</i> es un periodo cerrado la toma el llamador (que es quien tiene el reloj), no
        /// esta clase: aquí no se lee ninguna fecha del sistema.
        /// </param>
        /// <remarks>
        /// La ventana (<see cref="IsInMatchWindow"/>) se exige para <b>las dos fuerzas</b>, tal como
        /// la enuncia el plan: la fuerte no se concede fuera del periodo, y la débil tampoco, porque
        /// una sugerencia que ignora la ventana ofrecería enlazar un cargo anterior a
        /// <c>planned_date</c> con una partida que el usuario no planificó para esa fecha. Que la
        /// débil no escriba evita el daño contable, no el enlace equivocado que se le propone al
        /// usuario.
        /// </remarks>
        public static BudgetItemMatchStrength EvaluateStrength(
            in BudgetItemMatchInput input,
            decimal tolerancePct,
            bool periodIsClosed = false)
        {
            if (!IsSameKind(input))
            {
                return BudgetItemMatchStrength.None;
            }

            // Se calcula una vez para las dos fuerzas: la ventana es la misma precondición.
            var withinWindow = IsInMatchWindow(input, periodIsClosed);

            if (withinWindow && IsStrongMatch(input, tolerancePct))
            {
                return BudgetItemMatchStrength.Strong;
            }

            if (withinWindow && IsSameScope(input) && IsSameMonth(input))
            {
                return BudgetItemMatchStrength.Weak;
            }

            return BudgetItemMatchStrength.None;
        }

        /// <summary>
        /// Evalúa el par y lo devuelve con su fuerza y su distancia en días, listo para ordenarse.
        /// </summary>
        public static BudgetItemMatchCandidate Evaluate(
            in BudgetItemMatchInput input,
            decimal tolerancePct,
            bool periodIsClosed = false)
        {
            return new BudgetItemMatchCandidate
            {
                Input = input,
                Strength = EvaluateStrength(input, tolerancePct, periodIsClosed),
                DistanceDays = DistanceInDays(input)
            };
        }

        /// <summary>
        /// Elige la candidata que se enlaza (plan §4.4 punto 3): la de fecha más cercana a
        /// <c>planned_date</c>. El resto queda como gasto normal — no hay doble conteo porque el
        /// índice único parcial <c>uq_budget_items_transaction</c> admite una sola fila por
        /// transacción.
        /// </summary>
        /// <remarks>
        /// <para><b>Desempate.</b> Cuando dos candidatas están a la misma distancia, gana la de
        /// <b>menor <c>ItemId</c></b>. Es estable y determinista: la misma entrada elige siempre la
        /// misma partida y el resultado no depende del orden en que la base devolvió las filas,
        /// que en SQL no está garantizado sin <c>ORDER BY</c>. Se desempata por id y no por monto
        /// porque el monto no es una identidad: dos partidas del mismo importe son indistinguibles
        /// por él.</para>
        /// <para>Solo se consideran candidatas <see cref="BudgetItemMatchStrength.Strong"/>: las
        /// débiles son sugerencias y esta función es la que decide qué se escribe.</para>
        /// </remarks>
        public static BudgetItemMatchCandidate? SelectBest(IEnumerable<BudgetItemMatchCandidate> candidates)
        {
            BudgetItemMatchCandidate? best = null;

            foreach (var candidate in candidates)
            {
                if (candidate.Strength != BudgetItemMatchStrength.Strong)
                {
                    continue;
                }

                if (best == null || IsCloser(candidate, best.Value))
                {
                    best = candidate;
                }
            }

            return best;
        }

        /// <summary>
        /// Candidatas débiles del mismo periodo, ordenadas de forma estable. Alimenta
        /// <c>GET /api/budget-items/suggestions</c> y <b>no escribe nada</b>: la débil existe para
        /// que el usuario decida, y un enlace automático sobre "misma categoría" convertiría una
        /// conjetura en un hecho contable.
        /// </summary>
        /// <remarks>
        /// <para>Orden: por <c>ItemId</c> y luego por cercanía a la fecha planificada, de modo que la lista
        /// sea estable entre llamadas y las sugerencias de una partida queden juntas.</para>
        /// <para>La ventana también se exige aquí, aunque no escriba: <see cref="SelectWeak"/> llama
        /// <see cref="Evaluate"/> con <c>periodIsClosed = false</c>, de modo que una sugerencia solo
        /// aparece para un gasto dentro de <c>planned_date</c> → fin de mes. Sugerir un cargo anterior
        /// a la fecha planificada no es una conjetura tímida: es otro movimiento con la misma
        /// categoría, y ofrecerlo como "quizás es esta partida" empuja al usuario a un enlace que el
        /// sistema ya sabe que es falso.</para>
        /// </remarks>
        public static IReadOnlyList<BudgetItemMatchCandidate> SelectWeak(
            IEnumerable<BudgetItemMatchInput> inputs,
            decimal tolerancePct)
        {
            return inputs
                .Select(input => Evaluate(input, tolerancePct))
                .Where(candidate => candidate.Strength == BudgetItemMatchStrength.Weak)
                .OrderBy(candidate => candidate.Input.ItemId)
                .ThenBy(candidate => candidate.DistanceDays)
                .ThenBy(candidate => candidate.Input.TransactionId)
                .ToList();
        }

        /// <summary>
        /// La ventana de la sección 4.4 es <c>planned_date</c> (inclusive) → <b>fin de mes</b>
        /// (inclusive), comparada contra el <b>día local</b> de la transacción. Es el mes y no
        /// <c>planned_date</c> + N días porque el día real del cargo no se conoce; el mes sí.
        /// </summary>
        public static bool IsWithinWindow(in BudgetItemMatchInput input)
        {
            return input.TransactionLocalDate >= input.PlannedDate &&
                   input.TransactionLocalDate <= LastDayOfMonth(input.PlannedDate);
        }

        /// <summary>
        /// ¿El <c>kind</c> de la partida es el tipo de la transacción? Ordinal ignorando mayúsculas:
        /// <c>budget_items.kind</c> y <c>transactions.type</c> son columnas distintas, y el tipo
        /// admite valores que no son de plan (<c>transfer</c>, <c>opening_credit</c>) que quedan
        /// fuera por definición: no existen partidas de esos tipos.
        /// </summary>
        public static bool IsSameKind(in BudgetItemMatchInput input)
        {
            return string.Equals(
                input.ItemKind?.Trim(),
                input.TransactionType?.Trim(),
                StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Ventana efectiva del par: la normal de la sección 4.4 punto 1
        /// (<c>planned_date</c> → <b>fin de mes</b>) y, cuando el periodo de la partida ya está
        /// cerrado, la excepción del pago tardío. Es la única forma de decidir si la ventana se
        /// cumple, y se exige por igual para las dos fuerzas.
        /// </summary>
        public static bool IsInMatchWindow(in BudgetItemMatchInput input, bool periodIsClosed)
        {
            return IsWithinWindow(input) || (periodIsClosed && IsLatePayment(input));
        }

        /// <summary>
        /// Excepción a la ventana de un periodo ya cerrado (sección 4.4 punto 4): el pago llega
        /// <b>tarde</b>, nunca antes. Relaja el <b>tope</b> de la ventana y <b>no impone ninguno</b>.
        /// </summary>
        /// <remarks>
        /// <para><b>Por qué no hay tope de meses.</b> El plan §4.4 punto 4 no fija ninguno: dice que
        /// si una transacción matchea una partida <c>pending</c> de un mes ya cerrado, se enlaza a esa
        /// partida y el reporte del mes cerrado pasa a <c>executed</c>. Un tope —un mes de gracia,
        /// dos, seis— sería una regla de negocio que nadie decidió, y su efecto es peor que el
        /// problema que se pretendería evitar: una partida realmente pagada con dos meses de retraso
        /// queda <c>pending</c> para siempre, su monto se reporta como comprometido o como
        /// unexecuted, y el mes en que el dinero efectivamente salió nunca aparece como ejecutado. El
        /// pago tardío que sí ocurrió es un hecho; ocultarlo para proteger un reporte viejo vuelve
        /// falso ese reporte, que es justo lo que la excepción existe para arreglar.</para>
        /// <para><b>Qué sigue sin moverse.</b> El <b>piso</b>: <c>planned_date</c>. Un cargo anterior
        /// a la fecha planificada sigue siendo otro movimiento, no un pago tardío. Y la <b>fuerza</b>:
        /// solo la regla fuerte (<see cref="IsStrongMatch"/>) puede enlazar un pago tardío, porque la
        /// débil exige además el mismo periodo (<see cref="IsSameMonth"/>) y entre meses distintos
        /// eso ya es imposible. La excepción quita un plazo; no compra conjeturas.</para>
        /// </remarks>
        public static bool IsLatePayment(in BudgetItemMatchInput input)
        {
            return input.TransactionLocalDate >= input.PlannedDate;
        }

        /// <summary>Regla fuerte. Dos caminos, ambos dentro de la ventana:
        /// <list type="bullet">
        /// <item><b>Comercio:</b> mismo <c>merchant_id</c> y monto dentro de la tolerancia.</item>
        /// <item><b>Cuenta + alcance:</b> mismo <c>account_id</c>, mismo scope y monto exacto.</item>
        /// </list>
        /// Un id nulo no es un match: dos nulos no son "el mismo comercio". La segunda rama no lleva
        /// tolerancia porque el plan la pide exacta; con el default 0% ambas ramas coinciden.
        /// </summary>
        public static bool IsStrongMatch(in BudgetItemMatchInput input, decimal tolerancePct)
        {
            if (input.ItemMerchantId.HasValue &&
                input.ItemMerchantId == input.TransactionMerchantId &&
                IsAmountWithinTolerance(input.PlannedAmount, input.TransactionAmount, tolerancePct))
            {
                return true;
            }

            return input.ItemAccountId.HasValue &&
                   input.ItemAccountId == input.TransactionAccountId &&
                   IsSameScope(input) &&
                   input.PlannedAmount == input.TransactionAmount;
        }

        /// <summary>
        /// Tolerancia de monto de la regla fuerte por comercio. La fracción se calcula sobre la
        /// <b>magnitud</b> del monto planificado y se redondea a <b>2 decimales</b>, la misma escala
        /// de <c>planned_amount</c> y <c>amount</c> (<c>decimal(15,2)</c>): no se inventa precisión
        /// que la columna no tiene, así que 0% equivale a igualdad exacta y ningún porcentaje produce
        /// un umbral de medio centavo. Una tolerancia negativa se trata como 0 (exacto): la
        /// tolerancia amplía un rango, nunca lo reduce por debajo de la partida.
        /// </summary>
        /// <remarks>
        /// <para>La comparación es <b>sobre magnitudes</b>, no sobre el signo:
        /// <c>|amount − plannedAmount| ≤ |plannedAmount| × pct/100</c>. Si el umbral conservara el
        /// signo del monto planificado se volcaría al ser este negativo, y <c>0 ≤ −5</c> es falso: un
        /// importe negativo idéntico al planificado fallaría <b>contra sí mismo</b> con cualquier
        /// tolerancia. Con la magnitud, el signo deja de decidir —un monto negativo igual al
        /// planificado cumple con cualquier tolerancia, y dos importes de signo opuesto solo se
        /// aceptan si su diferencia absoluta cabe en el margen: 100 contra −100 con 5% se rechaza,
        /// porque 200 excede 5.</para>
        /// <para>Para montos positivos la expresión es idéntica a la anterior
        /// (<c>Math.Abs(p) == p</c>), así que los bordes verificados no cambian: 100 con 5% acepta 95
        /// y 105 y rechaza 94.99 y 105.01; 0.10 con 5% redondea el umbral a 0.01 y acepta 0.11 y
        /// rechaza 0.12.</para>
        /// </remarks>
        public static bool IsAmountWithinTolerance(decimal plannedAmount, decimal amount, decimal tolerancePct)
        {
            if (tolerancePct <= 0m)
            {
                return amount == plannedAmount;
            }

            var allowedDelta = Math.Round(
                Math.Abs(plannedAmount) * tolerancePct / 100m,
                2,
                MidpointRounding.AwayFromZero);

            return Math.Abs(amount - plannedAmount) <= allowedDelta;
        }

        /// <summary>
        /// Mismo alcance: la partida se define por categoría <b>o</b> por subcategoría (XOR en
        /// <c>ck_budget_items_scope</c>), y la transacción debe caer exactamente en ese campo. Una
        /// partida por categoría no matchea por subcategoría aunque la subcategoría sea hija: el
        /// match es por identidad del id, no por jerarquía.
        /// </summary>
        public static bool IsSameScope(in BudgetItemMatchInput input)
        {
            if (input.ItemSubcategoryId.HasValue)
            {
                return input.ItemSubcategoryId == input.TransactionSubcategoryId;
            }

            if (input.ItemCategoryId.HasValue)
            {
                return input.ItemCategoryId == input.TransactionCategoryId;
            }

            return false;
        }

        /// <summary>
        /// Mes de la transacción contra mes de la partida. La excepción a la ventana de la sección
        /// 4.4 punto 4 (pago tardío que enlaza una partida <c>pending</c> de un mes ya cerrado) la
        /// resuelve el <b>servicio</b>, que es quien sabe si el periodo está cerrado; esta clase solo
        /// compara periodos.
        /// </summary>
        public static bool IsSameMonth(in BudgetItemMatchInput input)
        {
            return string.Equals(PeriodKeyOf(input.TransactionLocalDate), input.PeriodKey, StringComparison.Ordinal);
        }

        /// <summary>Días entre la fecha planificada y el día local de la transacción, con signo.</summary>
        public static int SignedDistanceInDays(in BudgetItemMatchInput input)
        {
            return input.TransactionLocalDate.DayNumber - input.PlannedDate.DayNumber;
        }

        /// <summary>Días de distancia, sin signo: la llave de orden de <see cref="SelectBest"/>.</summary>
        public static int DistanceInDays(in BudgetItemMatchInput input)
        {
            return Math.Abs(SignedDistanceInDays(input));
        }

        /// <summary>
        /// Fin de la ventana normal de la partida. <b>No existe un "fin del mes siguiente"</b>: la
        /// excepción del pago tardío (sección 4.4 punto 4) no fija un tope superior, y publicar aquí
        /// una fecha de caducidad reintroduciría, como constante pública, el tope que el plan no
        /// define. Ver <see cref="IsLatePayment"/>.
        /// </summary>
        public static DateOnly LastDayOfMonth(DateOnly date)
        {
            return new DateOnly(date.Year, date.Month, DateTime.DaysInMonth(date.Year, date.Month));
        }

        /// <summary>Periodo <c>yyyy-MM</c> de una fecha local.</summary>
        public static string PeriodKeyOf(DateOnly localDate)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{localDate.Year:D4}-{localDate.Month:D2}");
        }

        /// <summary>
        /// Orden de preferencia del plan §4.4 punto 3: más cercana a <c>planned_date</c> primero; a
        /// igual distancia, la de menor <c>ItemId</c>.
        /// </summary>
        private static bool IsCloser(in BudgetItemMatchCandidate candidate, in BudgetItemMatchCandidate incumbent)
        {
            if (candidate.DistanceDays != incumbent.DistanceDays)
            {
                return candidate.DistanceDays < incumbent.DistanceDays;
            }

            return candidate.Input.ItemId < incumbent.Input.ItemId;
        }
    }
}
