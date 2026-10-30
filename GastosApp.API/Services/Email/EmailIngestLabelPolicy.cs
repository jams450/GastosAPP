namespace GastosApp.API.Services.Email;

/// <summary>Qué dice la instantánea de etiquetas de Gmail sobre un mensaje.</summary>
public enum EmailLabelSnapshotVerdict
{
    /// <summary>Solo etiquetas del sistema (INBOX, banderas, categorías de Gmail): el correo está sin etiquetar.</summary>
    NoUserLabel,

    /// <summary>Tiene al menos una etiqueta de usuario existente: no debe recibir otra.</summary>
    HasUserLabel,

    /// <summary>Hay una etiqueta que no es del sistema ni una carpeta de usuario conocida.</summary>
    UnknownLabel
}

/// <summary>
/// Interpreta la instantánea <c>GMailLabels</c> contra las carpetas enumeradas en la MISMA conexión.
/// <para>
/// El prefilro del servidor (<c>has:nouserlabels</c>) no se toma como verdad: la decisión de escribir
/// se apoya en esta comparación, y una etiqueta no reconocida se rechaza de forma conservadora. No se
/// crea, mueve, borra ni expulsa nada; solo se decide si se puede agregar una etiqueta existente.
/// </para>
/// </summary>
public static class EmailIngestLabelPolicy
{
    /// <summary>
    /// Nombres completos de las carpetas que son etiquetas de usuario escribibles, según la política
    /// compartida <see cref="ImapApplyPolicy.IsUserLabel"/>. Se comparan con ordinal.
    /// </summary>
    public static IReadOnlySet<string> UserLabelNames(IEnumerable<ImapTargetFolder> folders)
    {
        ArgumentNullException.ThrowIfNull(folders);

        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var folder in folders)
        {
            if (ImapApplyPolicy.IsUserLabel(folder))
            {
                names.Add(folder.FullName.Trim());
            }
        }

        return names;
    }

    /// <summary>
    /// Veredicto de la instantánea. Una instantánea ausente (<c>null</c>) no se puede confirmar y se
    /// rechaza; una lista vacía sí dice que el mensaje no tiene etiquetas.
    /// </summary>
    public static EmailLabelSnapshotVerdict Evaluate(
        IEnumerable<string>? snapshot,
        IReadOnlySet<string> userLabelNames)
    {
        ArgumentNullException.ThrowIfNull(userLabelNames);

        // Sin instantánea no hay nada que confirmar: se falla cerrado en lugar de asumir vacío.
        if (snapshot is null)
        {
            return EmailLabelSnapshotVerdict.UnknownLabel;
        }

        var unknown = false;

        foreach (var label in snapshot)
        {
            if (string.IsNullOrWhiteSpace(label))
            {
                continue;
            }

            var name = label.Trim();

            if (userLabelNames.Contains(name))
            {
                return EmailLabelSnapshotVerdict.HasUserLabel;
            }

            if (ImapApplyPolicy.IsSystemLabelName(name))
            {
                continue;
            }

            // Nombre no reconocido: puede ser una etiqueta de usuario que la enumeración no vio.
            // Se rechaza de forma conservadora en lugar de escribir encima.
            unknown = true;
        }

        return unknown ? EmailLabelSnapshotVerdict.UnknownLabel : EmailLabelSnapshotVerdict.NoUserLabel;
    }
}
