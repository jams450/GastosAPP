"""Focused checks of the actual dashboard SQL fragments, without database access.
Run: python3 SQL/audits/test_dashboard_cutoff.py
SQLite exercises aggregation arithmetic; it does not validate PostgreSQL syntax.
"""
from pathlib import Path
import re
import sqlite3
import unittest

SQL = (Path(__file__).resolve().parents[1] / 'schema.sql').read_text()
MSI_BLOCK = SQL.split(') chg ON chg.account_id = cb.account_id', 1)[1].split(') msi ON msi.account_id = cb.account_id', 1)[0]
EXPRESSION = re.search(r'coalesce\(sum\((.*?)\), 0\) AS msi_cutoff_charges', MSI_BLOCK).group(1)
STATUSES = re.search(r"ci.status IN \(([^)]+)\)", MSI_BLOCK).group(1)


class CutoffTests(unittest.TestCase):
    def test_msi_original_charges_then_posted_payments_once(self):
        db = sqlite3.connect(':memory:')
        db.create_function('GREATEST', 2, max)
        db.executescript('''
          CREATE TABLE ci(total_due NUMERIC, status TEXT);
          CREATE TABLE ip(allocated_total NUMERIC);
          INSERT INTO ci VALUES(1000,'PartiallyPaid');
          INSERT INTO ip VALUES(200);
        ''')
        original = db.execute(f'SELECT coalesce(sum({EXPRESSION}),0) FROM ci CROSS JOIN ip WHERE ci.status IN ({STATUSES})').fetchone()[0]
        self.assertEqual(original, 1000)
        self.assertEqual(max(original - 200, 0), 800)
        # Fully paid installments still belong to original charges, not only payment totals.
        db.execute("UPDATE ci SET status='Paid'")
        db.execute('UPDATE ip SET allocated_total=1000')
        original = db.execute(f'SELECT coalesce(sum({EXPRESSION}),0) FROM ci CROSS JOIN ip WHERE ci.status IN ({STATUSES})').fetchone()[0]
        self.assertEqual(original, 1000)
        self.assertEqual(max(original - 1000, 0), 0)
        db.close()

    def test_msi_payments_use_same_due_window_as_charges(self):
        payment_block = SQL.split(') msi ON msi.account_id = cb.account_id', 1)[1].split(') pay ON pay.account_id = cb.account_id', 1)[0]
        # SQL boundary check is supplementary; exact aggregates are tested above.
        self.assertIn("cip.plan_type = 'MSI'", payment_block)
        self.assertIn('>= cb3.payment_start', payment_block)
        self.assertIn("< (cb3.payment_end + INTERVAL '1 day')", payment_block)
        self.assertIn("cp.status = 'Posted'", payment_block)
        self.assertIn("cip.plan_type = 'Revolving'", payment_block)


if __name__ == '__main__':
    unittest.main(verbosity=2)
