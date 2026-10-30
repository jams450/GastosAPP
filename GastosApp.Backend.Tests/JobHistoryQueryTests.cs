using GastosApp.API.Services.Jobs;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the paging rules of the run history (S1/L5).
/// <para>
/// There is no destructive retention in this first module, so the history only grows: paging is what
/// keeps a screen from asking for the whole table. The clamp and the page count are pure functions
/// precisely so they can be fixed without a database.
/// </para>
/// <para>
/// They live beside the read model that serves them (<c>JobRunQueryService</c>) instead of inside
/// <see cref="JobCatalogTests"/>: the catalog does not page anything.
/// </para>
/// </summary>
public class JobHistoryQueryTests
{
    [Fact]
    public void The_page_and_page_size_are_bounded()
    {
        Assert.Equal(1, JobHistoryQuery.NormalizePage(null));
        Assert.Equal(1, JobHistoryQuery.NormalizePage(0));
        Assert.Equal(1, JobHistoryQuery.NormalizePage(-4));
        Assert.Equal(3, JobHistoryQuery.NormalizePage(3));

        Assert.Equal(JobHistoryQuery.DefaultPageSize, JobHistoryQuery.NormalizePageSize(null));
        Assert.Equal(1, JobHistoryQuery.NormalizePageSize(0));
        Assert.Equal(1, JobHistoryQuery.NormalizePageSize(-10));
        Assert.Equal(JobHistoryQuery.MaxPageSize, JobHistoryQuery.NormalizePageSize(10_000));
        Assert.Equal(50, JobHistoryQuery.NormalizePageSize(50));
    }

    [Fact]
    public void The_page_count_describes_the_real_range()
    {
        Assert.Equal(0, JobHistoryQuery.TotalPages(0, 25));
        Assert.Equal(1, JobHistoryQuery.TotalPages(1, 25));
        Assert.Equal(1, JobHistoryQuery.TotalPages(25, 25));
        Assert.Equal(2, JobHistoryQuery.TotalPages(26, 25));
    }
}
