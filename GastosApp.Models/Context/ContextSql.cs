using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using GastosApp.Models.Models;
using GastosApp.Models.Interfaces;

namespace GastosApp.Models.Context
{
    public class ContextSql : DbContext
    {
        private readonly ICurrentUserService _cuser;

        public ContextSql(DbContextOptions options, ICurrentUserService currentUser) : base(options)
        {
            _cuser = currentUser;
        }

         public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            AddTimeStamps();
            return base.SaveChangesAsync(cancellationToken);
        }

        public Task<int> SaveChangesNormal(CancellationToken cancellationToken = default)
        {
            return base.SaveChangesAsync(cancellationToken);
        }

        public override int SaveChanges()
        {
            AddTimeStamps();
            return base.SaveChanges();
        }

        private void AddTimeStamps()
        { 
            var entities = ChangeTracker.Entries()
                .Where(x => x.Entity is BaseModel && (x.State == EntityState.Added || x.State == EntityState.Modified));

            foreach (var e in entities)
            {
                var Dnow = DateTime.UtcNow;
                var model = (BaseModel)e.Entity;
                if (e.State == EntityState.Added)
                {
                    model.Created = Dnow;
                    model.CreatedBy = _cuser.GetName();
                }
                else
                {
                    // Evitar que EF sobrescriba los campos de creación
                    e.Property(nameof(BaseModel.Created)).IsModified = false;
                    e.Property(nameof(BaseModel.CreatedBy)).IsModified = false;

                    model.Updated = Dnow;
                    model.UpdatedBy = _cuser.GetName();
                }
            }
        }
    }
}