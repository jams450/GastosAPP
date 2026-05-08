namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICurrentUserService
    {
        int? GetUserId();
        string GetName();
        string GetEmail();
        bool IsAdmin();
    }
}
