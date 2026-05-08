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
        public DbSet<UserSession> UserSessions { get; set; } = null!;
        public DbSet<Account> Accounts { get; set; } = null!;
        public DbSet<Category> Categories { get; set; } = null!;
        public DbSet<Subcategory> Subcategories { get; set; } = null!;
        public DbSet<Merchant> Merchants { get; set; } = null!;
        public DbSet<Tag> Tags { get; set; } = null!;
        public DbSet<CategoryTag> CategoryTags { get; set; } = null!;
        public DbSet<TransactionTag> TransactionTags { get; set; } = null!;
        public DbSet<Transaction> Transactions { get; set; } = null!;
        public DbSet<CreditCycle> CreditCycles { get; set; } = null!;
        public DbSet<CreditCharge> CreditCharges { get; set; } = null!;
        public DbSet<CreditInstallmentPlan> CreditInstallmentPlans { get; set; } = null!;
        public DbSet<CreditInstallment> CreditInstallments { get; set; } = null!;
        public DbSet<CreditPayment> CreditPayments { get; set; } = null!;
        public DbSet<InstallmentAllocation> InstallmentAllocations { get; set; } = null!;
        public DbSet<BillableParty> BillableParties { get; set; } = null!;
        public DbSet<TransactionAllocation> TransactionAllocations { get; set; } = null!;

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
                entity.HasMany(e => e.OwnedBillableParties).WithOne(e => e.OwnerUser).HasForeignKey(e => e.OwnerUserId);
                entity.HasMany(e => e.Sessions).WithOne(e => e.User).HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<UserSession>(entity =>
            {
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.RefreshTokenHash).IsUnique();
                entity.HasIndex(e => e.ExpiresAt);
            });

            modelBuilder.Entity<Account>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditCharges).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditPayments).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditCycles).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditInstallmentPlans).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
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

            modelBuilder.Entity<BillableParty>(entity =>
            {
                entity.HasIndex(e => new { e.OwnerUserId, e.NormalizedName }).IsUnique();
                entity.HasIndex(e => new { e.OwnerUserId, e.Type, e.Active });
                entity.HasOne(e => e.LinkedUser)
                    .WithMany()
                    .HasForeignKey(e => e.LinkedUserId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<TransactionAllocation>(entity =>
            {
                entity.HasIndex(e => e.TransactionId);
                entity.HasIndex(e => e.BillablePartyId);
                entity.HasIndex(e => new { e.TransactionId, e.BillablePartyId }).IsUnique();
                entity.HasOne(e => e.Transaction)
                    .WithMany(e => e.TransactionAllocations)
                    .HasForeignKey(e => e.TransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.BillableParty)
                    .WithMany(e => e.TransactionAllocations)
                    .HasForeignKey(e => e.BillablePartyId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<CreditCycle>(entity =>
            {
                entity.HasIndex(e => new { e.AccountId, e.CutoffAt }).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.DueAt });
            });

            modelBuilder.Entity<CreditCharge>(entity =>
            {
                entity.HasIndex(e => e.SourceTransactionId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.OccurredAt });
                entity.HasIndex(e => new { e.AccountId, e.Status });
                entity.HasOne(e => e.SourceTransaction)
                    .WithOne(e => e.CreditCharge)
                    .HasForeignKey<CreditCharge>(e => e.SourceTransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Cycle)
                    .WithMany(e => e.Charges)
                    .HasForeignKey(e => e.CycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditInstallmentPlan>(entity =>
            {
                entity.HasIndex(e => e.SourceChargeId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.Status });
                entity.HasOne(e => e.SourceCharge)
                    .WithOne(e => e.InstallmentPlan)
                    .HasForeignKey<CreditInstallmentPlan>(e => e.SourceChargeId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.StartCycle)
                    .WithMany()
                    .HasForeignKey(e => e.StartCycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditInstallment>(entity =>
            {
                entity.HasIndex(e => new { e.PlanId, e.InstallmentNumber }).IsUnique();
                entity.HasIndex(e => new { e.DueCycleId, e.Status });
                entity.HasOne(e => e.Plan)
                    .WithMany(e => e.Installments)
                    .HasForeignKey(e => e.PlanId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.DueCycle)
                    .WithMany(e => e.Installments)
                    .HasForeignKey(e => e.DueCycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditPayment>(entity =>
            {
                entity.HasIndex(e => e.SourceTransactionId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.PaidAt });
                entity.HasOne(e => e.SourceTransaction)
                    .WithOne(e => e.CreditPayment)
                    .HasForeignKey<CreditPayment>(e => e.SourceTransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InstallmentAllocation>(entity =>
            {
                entity.HasIndex(e => e.PaymentId);
                entity.HasIndex(e => e.InstallmentId);
                entity.HasOne(e => e.Payment)
                    .WithMany(e => e.Allocations)
                    .HasForeignKey(e => e.PaymentId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Installment)
                    .WithMany(e => e.Allocations)
                    .HasForeignKey(e => e.InstallmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
