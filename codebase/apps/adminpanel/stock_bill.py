"""
Parse wholesaler stock bill PDFs and apply line items to inventory.
Extracts: product name, quantity, MRP, expiry date, batch number.
"""
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Category, Company, Inventory, Product


# Column header keywords (lowercase) -> our field name
NAME_KEYS = ("product", "item", "name", "description", "medicine", "drug")
QTY_KEYS = ("qty", "quantity", "qty.", "units")
MRP_KEYS = ("mrp", "rate", "price", "selling", "unit price", "amount")
EXPIRY_KEYS = ("expiry", "exp", "exp date", "expiry date", "exp dt")
BATCH_KEYS = ("batch", "batch no", "batch no.", "batch number", "batch #")
MANUFACTURER_KEYS = ("mfg", "manufacturer", "company", "brand")


def _normalize_header(cell):
    if cell is None:
        return ""
    return str(cell).strip().lower().replace("\n", " ")


def _column_index(headers, key_groups):
    """Return 0-based column index for first matching key group, or None."""
    for keys in key_groups:
        for i, h in enumerate(headers):
            if any(k in h for k in keys):
                return i
    return None


def _parse_number(s):
    if s is None or (isinstance(s, str) and not s.strip()):
        return None
    s = str(s).strip().replace(",", "")
    # Remove currency symbols etc.
    s = re.sub(r"[^\d.-]", "", s)
    if not s:
        return None
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _parse_int(s):
    n = _parse_number(s)
    if n is None:
        return None
    try:
        return int(n)
    except (ValueError, InvalidOperation):
        return None


def _parse_date(s):
    if s is None or (isinstance(s, str) and not s.strip()):
        return None
    s = str(s).strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%d %b %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except (ValueError, TypeError):
            continue
    # Try DD/MM/YY
    m = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y < 50 else 1900
        try:
            return datetime(y, mo, d).date()
        except ValueError:
            pass
    return None


def parse_stock_bill_pdf(pdf_bytes):
    """
    Extract line items from a stock bill PDF.
    Returns list of dicts: product_name, quantity, mrp, expiry_date, batch_number, manufacturer.
    """
    try:
        import pdfplumber
    except ImportError:
        return [], "pdfplumber is required: pip install pdfplumber"

    items = []
    try:
        buf = BytesIO(pdf_bytes)
        with pdfplumber.open(buf) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if not table or len(table) < 2:
                            continue
                        raw_headers = table[0]
                        headers = [_normalize_header(c) for c in raw_headers]
                        name_col = _column_index(headers, [NAME_KEYS])
                        qty_col = _column_index(headers, [QTY_KEYS])
                        mrp_col = _column_index(headers, [MRP_KEYS])
                        expiry_col = _column_index(headers, [EXPIRY_KEYS])
                        batch_col = _column_index(headers, [BATCH_KEYS])
                        mfg_col = _column_index(headers, [MANUFACTURER_KEYS])

                        if name_col is None:
                            continue
                        for row in table[1:]:
                            if not row:
                                continue
                            name = (row[name_col] or "").strip() if name_col < len(row) else ""
                            if not name or name.lower() in ("total", "subtotal", "grand total", "product name"):
                                continue
                            qty = _parse_int(row[qty_col]) if qty_col is not None and qty_col < len(row) else None
                            mrp = _parse_number(row[mrp_col]) if mrp_col is not None and mrp_col < len(row) else None
                            expiry = _parse_date(row[expiry_col]) if expiry_col is not None and expiry_col < len(row) else None
                            batch = (row[batch_col] or "").strip() if batch_col is not None and batch_col < len(row) else ""
                            mfg = (row[mfg_col] or "").strip() if mfg_col is not None and mfg_col < len(row) else ""
                            if qty is not None and qty > 0:
                                items.append({
                                    "product_name": name[:255],
                                    "quantity": qty,
                                    "mrp": mrp,
                                    "expiry_date": expiry,
                                    "batch_number": (batch or "BILL-UNKNOWN")[:80],
                                    "manufacturer": mfg[:150] if mfg else "",
                                })
                else:
                    text = page.extract_text()
                    if text:
                        items.extend(_parse_text_lines(text))
    except Exception as e:
        return [], str(e)

    if not items:
        return [], "No line items could be extracted from the PDF. Ensure the bill has a table with columns like Product Name, Qty, MRP, Expiry, Batch."

    return items, None


def _parse_text_lines(text):
    """Fallback: try to parse line-by-line when no table is detected."""
    items = []
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if not line or len(line) < 5:
            continue
        # Look for numbers (qty, mrp) and date-like patterns
        parts = re.split(r"\s{2,}|\t", line)
        if len(parts) < 2:
            continue
        name = parts[0][:255]
        nums = []
        date_str = None
        for p in parts[1:]:
            n = _parse_number(p)
            if n is not None:
                nums.append(n)
            if _parse_date(p) is not None:
                date_str = p
        if not nums:
            continue
        qty = int(nums[0]) if nums else 1
        mrp = nums[1] if len(nums) > 1 else None
        expiry = _parse_date(date_str) if date_str else None
        batch = "BILL-UNKNOWN"
        items.append({
            "product_name": name,
            "quantity": qty,
            "mrp": mrp,
            "expiry_date": expiry,
            "batch_number": batch,
            "manufacturer": "",
        })
    return items


def _get_default_category():
    cat = Category.objects.order_by("id").first()
    if cat:
        return cat
    return Category.objects.create(name="Uncategorized", slug="uncategorized")


def _find_product_by_name(name, manufacturer=""):
    """Find existing product by name (and optionally manufacturer)."""
    name_clean = name.strip()
    if not name_clean:
        return None
    qs = Product.objects.filter(is_active=True)
    exact = qs.filter(name__iexact=name_clean).first()
    if exact:
        return exact
    return qs.filter(name__icontains=name_clean).first()


def apply_stock_bill_lines(lines, default_category_id=None):
    """
    Apply parsed stock bill lines to inventory.
    - If product exists and batch exists: update stock_quantity, selling_price, expiry_date.
    - If product exists, batch new: create new Inventory row.
    - If product does not exist: create Product (using default category) and Inventory row.

    Returns dict: updated_count, created_count, products_created, errors (list of strings).
    """
    updated_count = 0
    created_count = 0
    products_created = 0
    errors = []
    today = timezone.now().date()

    category = None
    if default_category_id:
        category = Category.objects.filter(pk=default_category_id).first()
    if category is None:
        category = _get_default_category()

    for idx, line in enumerate(lines):
        name = (line.get("product_name") or "").strip()
        qty = line.get("quantity")
        mrp = line.get("mrp")
        expiry = line.get("expiry_date")
        batch = (line.get("batch_number") or "BILL-UNKNOWN").strip()[:80]
        manufacturer = (line.get("manufacturer") or "").strip()[:150]

        if not name:
            errors.append(f"Row {idx + 1}: missing product name")
            continue
        if qty is None or qty < 1:
            errors.append(f"Row {idx + 1} ({name}): invalid quantity")
            continue

        mrp = mrp if mrp is not None and mrp >= 0 else Decimal("0")
        if expiry is None:
            expiry = today
        location_code = ""

        try:
            with transaction.atomic():
                product = _find_product_by_name(name, manufacturer)
                if product is None:
                    product = Product.objects.create(
                        name=name,
                        category=category,
                        company_name=manufacturer or "",
                        unit="piece",
                        stock_quantity=0,
                        price=Decimal("0"),
                    )
                    products_created += 1

                inv = Inventory.objects.filter(
                    medicine=product,
                    batch_number=batch,
                    location_code=location_code,
                ).first()

                if inv:
                    inv.stock_quantity += qty
                    inv.selling_price = mrp
                    inv.expiry_date = expiry
                    inv.manufacturer = manufacturer or inv.manufacturer
                    inv.save(update_fields=["stock_quantity", "selling_price", "expiry_date", "manufacturer", "updated_at"])
                    updated_count += 1
                else:
                    Inventory.objects.create(
                        medicine=product,
                        batch_number=batch,
                        manufacturer=manufacturer or "",
                        manufacture_date=today,
                        expiry_date=expiry,
                        location_code=location_code,
                        stock_quantity=qty,
                        purchase_price=mrp,
                        selling_price=mrp,
                    )
                    created_count += 1
        except Exception as e:
            errors.append(f"Row {idx + 1} ({name}): {e}")

    return {
        "lines_processed": len(lines),
        "batches_updated": updated_count,
        "batches_created": created_count,
        "products_created": products_created,
        "errors": errors,
    }
