using Microsoft.EntityFrameworkCore;

namespace GastosApp.Models.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Aquí se configurarán las entidades cuando se creen
        // modelBuilder.Entity<User>().ToTable("users");
    }
}
