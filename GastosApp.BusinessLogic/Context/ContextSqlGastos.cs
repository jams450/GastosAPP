using Microsoft.EntityFrameworkCore;
using GastosApp.Models.Interfaces;
using GastosApp.Models.Context;
using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Context
{
    public class ContextSqlGastos : ContextSql
    {
        public ContextSqlGastos(DbContextOptions<ContextSqlGastos> options, ICurrentUserService currentUser)
            : base(options, currentUser)
        {
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Account> Accounts { get; set; } = null!;
        public DbSet<Category> Categories { get; set; } = null!;
        public DbSet<Subcategory> Subcategories { get; set; } = null!;
        public DbSet<Merchant> Merchants { get; set; } = null!;
        public DbSet<Tag> Tags { get; set; } = null!;
        public DbSet<CategoryTag> CategoryTags { get; set; } = null!;
        public DbSet<TransactionTag> TransactionTags { get; set; } = null!;
        public DbSet<Transaction> Transactions { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(e => e.Email).IsUnique();
                entity.HasMany(e => e.Accounts).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Categories).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Subcategories).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Merchants).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Tags).WithOne(e => e.User).HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<Account>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
            });

            modelBuilder.Entity<Category>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Category).HasForeignKey(e => e.CategoryId);
                entity.HasMany(e => e.Subcategories).WithOne(e => e.Category).HasForeignKey(e => e.CategoryId);
                entity.HasIndex(e => new { e.UserId, e.Type, e.Name });
            });

            modelBuilder.Entity<Subcategory>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Subcategory).HasForeignKey(e => e.SubcategoryId);
                entity.HasIndex(e => new { e.UserId, e.CategoryId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<Merchant>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Merchant).HasForeignKey(e => e.MerchantId);
                entity.HasIndex(e => new { e.UserId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<Tag>(entity =>
            {
                entity.HasIndex(e => new { e.UserId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<CategoryTag>(entity =>
            {
                entity.HasKey(e => new { e.CategoryId, e.TagId });
                entity.HasOne(e => e.Category)
                    .WithMany(e => e.CategoryTags)
                    .HasForeignKey(e => e.CategoryId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Tag)
                    .WithMany(e => e.CategoryTags)
                    .HasForeignKey(e => e.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TransactionTag>(entity =>
            {
                entity.HasKey(e => new { e.TransactionId, e.TagId });
                entity.HasOne(e => e.Transaction)
                    .WithMany(e => e.TransactionTags)
                    .HasForeignKey(e => e.TransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Tag)
                    .WithMany(e => e.TransactionTags)
                    .HasForeignKey(e => e.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<Transaction>(entity =>
            {
                entity.HasIndex(e => e.TransferGroupId);
                entity.HasIndex(e => e.TransactionDate);
                entity.HasIndex(e => new { e.AccountId, e.TransactionDate });
                entity.HasIndex(e => new { e.CategoryId, e.TransactionDate });
                entity.HasIndex(e => new { e.SubcategoryId, e.TransactionDate });
                entity.HasIndex(e => new { e.MerchantId, e.TransactionDate });
            });
        }
    }
}
