using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

public class BillablePartyService : IBillablePartyService
{
    private readonly IRepository _repository;

    public BillablePartyService(IRepository repository)
    {
        _repository = repository;
    }

    public async Task<BillableParty?> GetByIdAsync(int id, int ownerUserId)
    {
        return await _repository.Get<BillableParty>(p => p.BillablePartyId == id && p.OwnerUserId == ownerUserId)
            .FirstOrDefaultAsync();
    }

    public async Task<IEnumerable<BillableParty>> GetByUserIdAsync(int ownerUserId, bool onlyActive = false)
    {
        return await _repository.Get<BillableParty>(p => p.OwnerUserId == ownerUserId && (!onlyActive || p.Active))
            .OrderBy(p => p.DisplayName)
            .ThenBy(p => p.BillablePartyId)
            .ToListAsync();
    }

    public async Task<BillableParty> CreateAsync(BillableParty billableParty, int ownerUserId)
    {
        billableParty.OwnerUserId = ownerUserId;
        billableParty.DisplayName = (billableParty.DisplayName ?? string.Empty).Trim();
        billableParty.NormalizedName = Normalize(billableParty.DisplayName);
        billableParty.Type = NormalizeType(billableParty.Type);
        billableParty.Active = true;
        billableParty.Created = DateTime.UtcNow;

        if (billableParty.Type == "self")
        {
            billableParty.LinkedUserId = ownerUserId;
        }

        return await _repository.Save(billableParty);
    }

    public async Task<BillableParty?> UpdateAsync(int id, BillableParty billableParty, int ownerUserId)
    {
        var existing = await _repository.GetTrack<BillableParty>()
            .FirstOrDefaultAsync(p => p.BillablePartyId == id && p.OwnerUserId == ownerUserId);

        if (existing == null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(billableParty.Type))
        {
            existing.Type = NormalizeType(billableParty.Type);
        }

        if (!string.IsNullOrWhiteSpace(billableParty.DisplayName))
        {
            existing.DisplayName = billableParty.DisplayName.Trim();
            existing.NormalizedName = Normalize(existing.DisplayName);
        }

        existing.Notes = billableParty.Notes;
        existing.Active = billableParty.Active;
        existing.LinkedUserId = existing.Type == "self"
            ? ownerUserId
            : billableParty.LinkedUserId;
        existing.Updated = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> UpdateActiveStatusAsync(int id, int ownerUserId, bool active)
    {
        var existing = await _repository.GetTrack<BillableParty>()
            .FirstOrDefaultAsync(p => p.BillablePartyId == id && p.OwnerUserId == ownerUserId);

        if (existing == null)
        {
            return false;
        }

        if (existing.Type == "self" && !active)
        {
            return false;
        }

        existing.Active = active;
        existing.Updated = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        return true;
    }

    public async Task<BillableParty> EnsureSelfPartyAsync(int ownerUserId, string? preferredName = null)
    {
        var existing = await _repository.GetTrack<BillableParty>()
            .FirstOrDefaultAsync(p => p.OwnerUserId == ownerUserId && p.Type == "self");

        if (existing != null)
        {
            if (!existing.Active)
            {
                existing.Active = true;
                existing.Updated = DateTime.UtcNow;
                await _repository.SaveChangesAsync();
            }

            return existing;
        }

        var displayName = string.IsNullOrWhiteSpace(preferredName) ? "Propio" : preferredName.Trim();
        var party = new BillableParty
        {
            OwnerUserId = ownerUserId,
            LinkedUserId = ownerUserId,
            Type = "self",
            DisplayName = displayName,
            NormalizedName = Normalize(displayName),
            Active = true,
            Created = DateTime.UtcNow
        };

        return await _repository.Save(party);
    }

    private static string NormalizeType(string? type)
    {
        var normalized = (type ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "self" => "self",
            "system_user" => "system_user",
            _ => "external_person"
        };
    }

    private static string Normalize(string value)
        => string.Join(' ', (value ?? string.Empty).Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
}
