namespace GastosApp.BusinessLogic.Models.Transactions
{
    public static class TransactionDomainConstants
    {
        public static class TransactionType
        {
            public const string Income = "income";
            public const string Expense = "expense";
            public const string Transfer = "transfer";
            public const string OpeningCredit = "opening_credit";
        }

        public static class Direction
        {
            public const string Debit = "debit";
            public const string Credit = "credit";
        }

        public static class CreditPlanType
        {
            public const string Revolving = "Revolving";
            public const string Msi = "MSI";
        }

        public static class AllocationMode
        {
            public const string Percentage = "percentage";
            public const string Amount = "amount";
        }

        public static class CreditStatus
        {
            public const string Open = "Open";
            public const string PartiallyPaid = "PartiallyPaid";
            public const string Paid = "Paid";
            public const string Active = "Active";
            public const string Completed = "Completed";
            public const string Posted = "Posted";
        }
    }
}
