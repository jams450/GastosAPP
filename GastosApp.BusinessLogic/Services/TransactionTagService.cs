using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class TransactionTagService : ITransactionTagService
    {
        private readonly IRepository _repository;
        private readonly ITagService _tagService;

        public TransactionTagService(IRepository repository, ITagService tagService)
        {
            _repository = repository;
            _tagService = tagService;
        }

        public async Task SyncTransactionTagsAsync(int transactionId, int userId, IEnumerable<string>? tagNames)
        {
            var transaction = await _repository.GetByIdAsync<Transaction>(transactionId);
            if (transaction == null) return;

            var tags = await _tagService.ResolveOrCreateAsync(userId, tagNames);
            var desiredTagIds = tags.Select(t => t.TagId).ToHashSet();

            var existing = await _repository.Get<TransactionTag>(tt => tt.TransactionId == transactionId).ToListAsync();
            var existingTagIds = existing.Select(tt => tt.TagId).ToHashSet();

            var toRemove = existing.Where(tt => !desiredTagIds.Contains(tt.TagId)).ToList();
            if (toRemove.Count > 0)
            {
                await _repository.RemoveRangeAsync(toRemove);
            }

            var toAdd = desiredTagIds.Where(id => !existingTagIds.Contains(id)).Select(tagId => new TransactionTag
            {
                TransactionId = transactionId,
                TagId = tagId
            }).ToList();

            if (toAdd.Count > 0)
            {
                _repository.GetTrack<TransactionTag>().AddRange(toAdd);
                await _repository.SaveChangesAsync();
            }
        }
    }
}
