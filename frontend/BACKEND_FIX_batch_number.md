# Fix: `column catalog_product.batch_number does not exist`

This error comes from your **Django backend** (e.g. when opening Orders or Inventory). The database table `catalog_product` has no column `batch_number`, but your code is trying to read it.

You can fix it in one of two ways, in your **Django project** (not in this frontend repo).

---

## Option 1: Add the column (if Product should have batch_number)

1. **In your Django app**, open the model that defines the product table (often `catalog/models.py` or similar). The model might be named `Product` and the table `catalog_product`.

2. **Add the field** to the model, for example:
   ```python
   class Product(models.Model):
       name = models.CharField(max_length=255)
       sku = models.CharField(max_length=100)
       batch_number = models.CharField(max_length=100, blank=True, default='')  # add this
       # ... other fields
   ```

3. **Create and run migrations**:
   ```bash
   python manage.py makemigrations catalog
   python manage.py migrate
   ```

4. Restart the Django server and try the admin Orders/Inventory again.

---

## Option 2: Stop using batch_number (if the column was never added)

If you do **not** want a `batch_number` on products:

1. **Serializers**  
   In the serializer that builds the order payload (and any product serializer that includes `batch_number`), remove or make optional the `batch_number` field so it is never read from the DB.

2. **Queries**  
   If you use something like `Product.objects.values('name', 'sku', 'batch_number', ...)` or a serializer that lists `batch_number`, remove `batch_number` from that list.

3. **Model**  
   If `batch_number` is still on the model but the column doesn’t exist in the DB, either:
   - add the column (Option 1), or  
   - remove the field from the model and run migrations so the table and model match.

---

## Quick check in Django

In your Django project:

```bash
python manage.py shell
```

Then:

```python
from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_product';")
print([r[0] for r in cursor.fetchall()])
```

If `batch_number` is not in the list, use **Option 1** (add field + migrate) or **Option 2** (stop using the field in serializers/queries and optionally remove it from the model).

---

After the backend is fixed, the frontend (this repo) does not need any changes; the Orders and Inventory pages will work once the API responds without that error.
