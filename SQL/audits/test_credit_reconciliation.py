"""Deterministic aggregation checks; no network or production credentials.
Run: python3 SQL/audits/test_credit_reconciliation.py
SQLite checks the portable relational query, not PostgreSQL runtime compatibility.
"""
import sqlite3
import unittest
from pathlib import Path

QUERY = Path(__file__).with_name('credit_reconciliation.sql').read_text()


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        CREATE TABLE accounts(account_id INT,user_id INT,name TEXT,active BOOLEAN,
          is_credit BOOLEAN,credit_limit NUMERIC,initial_balance NUMERIC,current_balance NUMERIC);
        CREATE TABLE transactions(transaction_id INT,account_id INT,type TEXT,
          transfer_group_id TEXT,amount NUMERIC,balance_impact NUMERIC);
        CREATE TABLE credit_installment_plans(plan_id INT,account_id INT,plan_type TEXT);
        CREATE TABLE credit_installments(installment_id INT,plan_id INT,status TEXT,total_due NUMERIC);
        CREATE TABLE credit_payments(payment_id INT,account_id INT,status TEXT);
        CREATE TABLE installment_allocations(installment_id INT,payment_id INT,allocated_amount NUMERIC);
        INSERT INTO accounts VALUES
          (1,7,'Active',1,1,1000,100,-20),
          (2,7,'Inactive',0,1,500,0,0),
          (3,8,'Other owner',1,1,900,0,900),
          (4,7,'Cash',1,0,NULL,0,-50),
          (5,7,'No limit',0,1,NULL,0,0);
        INSERT INTO transactions VALUES
          (1,1,'expense',NULL,150,-150),
          (2,1,'income',NULL,30,30),
          (3,1,'opening_credit',NULL,200,0),
          (4,4,'transfer','pair',50,0),
          (5,2,'transfer','pair',50,0),
          (6,3,'income',NULL,900,900);
        INSERT INTO credit_installment_plans VALUES
          (1,1,'Revolving'),(2,1,'MSI'),(3,2,'Revolving'),(4,3,'MSI');
        INSERT INTO credit_installments VALUES
          (1,1,'Open',200),(2,2,'PartiallyPaid',100),
          (3,2,'Paid',50),(4,3,'Overdue',600),(5,4,'Open',900),
          (6,1,'Paid',20);
        INSERT INTO credit_payments VALUES
          (1,1,'Posted'),(2,1,'Voided'),(3,1,'Posted');
        INSERT INTO installment_allocations VALUES
          (1,1,30),(1,3,20),(1,2,100),
          (2,1,10),(2,3,15),(3,1,60);
        ''')

    def tearDown(self):
        self.db.close()

    def rows(self):
        return {r['account_id']: dict(r) for r in self.db.execute(QUERY, {'user_id': 7})}

    def test_owner_credit_scope_includes_inactive_without_join_multiplication(self):
        rows = self.rows()
        self.assertEqual(set(rows), {1, 2, 5})
        self.assertEqual(rows[1]['movement_count'], 3)
        self.assertEqual(rows[1]['persisted_impact'], -120)
        self.assertEqual(rows[1]['persisted_residual'], 0)
        self.assertEqual(rows[1]['opening_credit_amount'], 200)

    def test_posted_allocations_once_and_canonical_statuses(self):
        row = self.rows()[1]
        self.assertEqual(row['normal_debt'], 150)
        self.assertEqual(row['msi_debt'], 75)
        self.assertEqual(row['total_debt'], 225)
        self.assertEqual(row['available'], 775)
        self.assertEqual(row['overallocated'], 10)
        self.assertEqual(row['paid_status_residual'], 20)
        self.assertEqual(row['cross_account_allocations'], 0)

    def test_legacy_transfer_ranking_keeps_cash_side(self):
        row = self.rows()[2]
        self.assertEqual(row['persisted_impact'], 0)
        self.assertEqual(row['reconstructed_impact'], 50)
        self.assertEqual(row['persisted_residual'], 0)
        self.assertEqual(row['reconstructed_residual'], -50)
        self.assertEqual(row['fallback_count'], 1)
        self.assertEqual(row['available'], -100)

    def test_totals_and_missing_limit(self):
        rows = list(self.rows().values())
        self.assertIsNone(rows[-1]['available'])
        self.assertEqual(sum(r['total_debt'] for r in rows), 825)
        self.assertEqual(sum(r['normal_debt'] for r in rows), 750)
        self.assertEqual(sum(r['msi_debt'] for r in rows), 75)
        self.assertEqual(sum(r['movement_count'] for r in rows), 4)
        for row in rows:
            self.assertEqual(row['total_debt'], row['normal_debt'] + row['msi_debt'])
            self.assertEqual(row['persisted_residual'], row['current_balance'] - row['initial_balance'] - row['persisted_impact'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
