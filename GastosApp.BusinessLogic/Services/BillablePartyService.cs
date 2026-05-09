using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

public class BillablePartyService : IBillablePartyService
{
    private const string TypeSelf = "self";
    private const string TypeSystemUser = "system_user";
    private const string TypeExternalPerson = "external_person";

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
        var displayName = NormalizeDisplayNameOrThrow(billableParty.DisplayName);

        billableParty.OwnerUserId = ownerUserId;
        billableParty.DisplayName = displayName;
        billableParty.NormalizedName = Normalize(displayName);
        billableParty.Type = NormalizeType(billableParty.Type);
        billableParty.Active = true;

        if (billableParty.Type == TypeSelf)
        {
            billableParty.LinkedUserId = ownerUserId;
        }

        try
        {
            return await _repository.Save(billableParty);
        }
        catch (DbUpdateException ex)
        {
            throw new ArgumentException("A billable party with same name already exists for this user", ex);
        }
    }

    public async Task<BillableParty?> UpdateAsync(int id, BillableParty billableParty, int ownerUserId)
    {
        var existing = await _repository.GetTrack<BillableParty>()
            .FirstOrDefaultAsync(p => p.BillablePartyId == id && p.OwnerUserId == ownerUserId);

        if (existing == null)
        {
            return null;
        }

        var incomingType = string.IsNullOrWhiteSpace(billableParty.Type)
            ? existing.Type
            : NormalizeType(billableParty.Type);

        if (existing.Type == TypeSelf && incomingType != TypeSelf)
        {
            throw new ArgumentException("Self billable party type cannot be changed");
        }

        existing.Type = incomingType;

        if (billableParty.DisplayName != null)
        {
            existing.DisplayName = NormalizeDisplayNameOrThrow(billableParty.DisplayName);
            existing.NormalizedName = Normalize(existing.DisplayName);
        }

        existing.Notes = billableParty.Notes;
        existing.LinkedUserId = existing.Type == TypeSelf
            ? ownerUserId
            : billableParty.LinkedUserId;

        try
        {
            await _repository.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            throw new ArgumentException("A billable party with same name already exists for this user", ex);
        }

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

        if (existing.Type == TypeSelf && !active)
        {
            return false;
        }

        existing.Active = active;
        await _repository.SaveChangesAsync();
        return true;
    }

    public async Task<BillableParty> EnsureSelfPartyAsync(int ownerUserId, string? preferredName = null)
    {
        var existing = await _repository.GetTrack<BillableParty>()
            .FirstOrDefaultAsync(p => p.OwnerUserId == ownerUserId && p.Type == TypeSelf);

        if (existing != null)
        {
            if (!existing.Active)
            {
                existing.Active = true;
                await _repository.SaveChangesAsync();
            }

            return existing;
        }

        var displayName = string.IsNullOrWhiteSpace(preferredName) ? "Propio" : preferredName.Trim();
        var party = new BillableParty
        {
            OwnerUserId = ownerUserId,
            LinkedUserId = ownerUserId,
            Type = TypeSelf,
            DisplayName = displayName,
            NormalizedName = Normalize(displayName),
            Active = true
        };

        try
        {
            return await _repository.Save(party);
        }
        catch (DbUpdateException ex)
        {
            throw new ArgumentException("A billable party with same name already exists for this user", ex);
        }
    }

    private static string NormalizeType(string? type)
    {
        var normalized = (type ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            TypeSelf => TypeSelf,
            TypeSystemUser => TypeSystemUser,
            _ => TypeExternalPerson
        };
    }

    private static string NormalizeDisplayNameOrThrow(string? displayName)
    {
        var normalized = (displayName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new ArgumentException("DisplayName is required");
        }

        return normalized;
    }

    private static string Normalize(string value)
        => string.Join(' ', (value ?? string.Empty).Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
}
