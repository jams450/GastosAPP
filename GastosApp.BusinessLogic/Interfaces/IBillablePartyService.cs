using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces;

public interface IBillablePartyService
{
    Task<BillableParty?> GetByIdAsync(int id, int ownerUserId);
    Task<IEnumerable<BillableParty>> GetByUserIdAsync(int ownerUserId, bool onlyActive = false);
    Task<BillableParty> CreateAsync(BillableParty billableParty, int ownerUserId);
    Task<BillableParty?> UpdateAsync(int id, BillableParty billableParty, int ownerUserId);
    Task<bool> UpdateActiveStatusAsync(int id, int ownerUserId, bool active);
    Task<BillableParty> EnsureSelfPartyAsync(int ownerUserId, string? preferredName = null);
}
