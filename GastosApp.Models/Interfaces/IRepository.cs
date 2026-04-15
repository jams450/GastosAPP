using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.Models.Interfaces
{
    public interface IRepository
    {
        string GetNombre();
        string GetUsername();

        IQueryable<T> Get<T>() where T : class;
        IQueryable<T> Get<T>(Expression<Func<T, bool>> predicate) where T : class;
        DbSet<T> GetTrack<T>() where T : class;

        Task<T?> GetByIdAsync<T>(int id) where T : class;
        Task<T?> GetByIdAsync<T>(Guid id) where T : class;

        Task<T> Save<T>(T model) where T : class;
        Task<T> SaveUpdate<T>(int Id, T model) where T : class;
        Task<T> SaveUpdate<T>(Guid Id, T model) where T : class;
        Task<T> AddOrUpdate<T>(T obj) where T : class;

        Task<bool> UpdateFieldAsync<T>(int id, string propertyName, object value) where T : class;
        Task<bool> UpdateFieldAsync<T, TValue>(int id, Expression<Func<T, TValue>> propertySelector, TValue value) where T : class;
        Task<int> UpdateFieldsAsync<T>(int id, Dictionary<string, object> fields) where T : class;
        Task<int> UpdateFieldsAsync<T>(T entity, Dictionary<string, object> fields) where T : class;

        Task<int> RemoveAsync<T>(T entity) where T : class;
        Task<int> RemoveAsync<T>(int id) where T : class;
        Task<int> RemoveRangeAsync<T>(List<T> entities) where T : class;
        Task<int> DeleteModel<T>(int id) where T : class;

        Task<List<T>> SyncAsync<T>(List<T> newListModel, List<T> currentListModel, Func<T, object> keySelector) where T : class;
        (List<T> ToAdd, List<T> ToRemove) DiffList<T, TKey>(IEnumerable<T> original, IEnumerable<T> updated, Func<T, TKey> keySelector);

        Task<int> ExecuteSqlRawAsync(string sql, params object[] parameters);
        Task<int> SaveChangesAsync();
    }
}