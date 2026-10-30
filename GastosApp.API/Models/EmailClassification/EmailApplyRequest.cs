namespace GastosApp.API.Models.EmailClassification;

/// <summary>
/// Entrada de aplicar la muestra revisada. Solo lleva el token: el plan completo (mensajes, buzón,
/// UIDVALIDITY y etiquetas destino) vive en el servidor desde la vista previa. No se aceptan ni
/// mensajes ni etiquetas en el cuerpo, para que la petición no pueda ampliar lo que la persona revisó.
/// </summary>
public class EmailApplyRequest
{
    public string? Token { get; set; }
}
