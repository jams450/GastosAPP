using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using GastosApp.Models.Models;

namespace GastosApp.Models.Entities
{
    [Table("telegram_identities")]
    public class TelegramIdentity : BaseModel
    {
        [Key]
        [Column("telegram_identity_id")]
        public int TelegramIdentityId { get; set; }

        [Column("telegram_user_id")]
        [Required]
        public long TelegramUserId { get; set; }

        [Column("telegram_chat_id")]
        [Required]
        public long TelegramChatId { get; set; }

        [Column("user_id")]
        [Required]
        public int UserId { get; set; }

        [Column("active")]
        public bool Active { get; set; } = true;

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
    }
}
