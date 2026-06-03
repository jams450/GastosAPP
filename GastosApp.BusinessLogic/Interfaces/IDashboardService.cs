using GastosApp.BusinessLogic.Models.Dashboard;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IDashboardService
    {
        Task<DashboardOverviewResponse> GetOverviewAsync(int userId, string? month, string timezoneId = "America/Mexico_City");
    }
}
