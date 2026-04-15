using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace GastosApp.Models.Interfaces
{
    public interface ICurrentUserService
    {
        int? GetUserId();
        string GetName();
        string GetEmail();
        bool IsAdmin();
    }
}
