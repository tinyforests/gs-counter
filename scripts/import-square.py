#!/usr/bin/env python3
"""Build an idempotent product-only SQL import from a Square CSV export.
Usage: python3 scripts/import-square.py /path/to/catalogue.csv > import.sql
Stock snapshots are deliberately excluded; existing counter products are preserved.
"""
import csv
import decimal
import json
import sys
import uuid

NAMESPACE = uuid.UUID('c3fb378f-695a-421a-a8da-2674b89fba47')
def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def build(path):
    with open(path, encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    products = []
    ids = set()
    for row in rows:
        if row['Archived'].strip().upper() == 'Y':
            continue
        token, name = row['Token'].strip(), row['Item Name'].strip()
        if not token or not name:
            raise ValueError('Every product needs a Square token and name')
        variation = row['Variation Name'].strip()
        if variation and variation.lower() != 'regular':
            name += ' — ' + variation
        price = decimal.Decimal(row['Price'].replace('$', '').replace(',', '').strip())
        if not price.is_finite() or price < 0 or price != price.quantize(decimal.Decimal('.01')):
            raise ValueError('Invalid price: ' + name)
        item_id = str(uuid.uuid5(NAMESPACE, token))
        if item_id in ids:
            raise ValueError('Duplicate Square token')
        ids.add(item_id)
        # Counter SKUs are numeric tag numbers, not Square identifiers.
        products.append('(' + ', '.join([quote(item_id), quote(name), str(price), "'{}'::jsonb"]) + ')')
    if not products:
        raise ValueError('No active products')
    return ('-- Square product catalogue: %d active products. No stock snapshot imported.\n'
            '-- Stable IDs make reruns safe; existing rows are never overwritten.\n'
            'begin;\ninsert into public.items (id, name, price, stock) values\n' % len(products)
            + ',\n'.join(products) + '\non conflict (id) do nothing;\ncommit;\n')

if __name__ == '__main__':
    print(build(sys.argv[1]), end='')
