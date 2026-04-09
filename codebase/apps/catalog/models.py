from django.db import models
from django.db.models import Min, Sum
from django.core.exceptions import ValidationError
from django.utils import timezone


class Category(models.Model):
    """Product category: Generic Medicine, Cosmetics, Oils, Syrup, etc."""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Company(models.Model):
    """Manufacturer/Brand: Mankind, Sun Pharma, Intas, etc."""
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Companies"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    """Medicine master table. Physical stock lives in Inventory batches."""
    UNIT_CHOICES = [
        ("strip", "Strip"),
        ("bottle", "Bottle"),
        ("pack", "Pack"),
        ("tube", "Tube"),
        ("jar", "Jar"),
        ("box", "Box"),
        ("piece", "Piece"),
        ("ml", "ml"),
        ("gm", "gm"),
    ]

    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=50, unique=True, blank=True)
    batch_number = models.CharField(max_length=80, blank=True, default="")
    company_name = models.CharField(max_length=150, blank=True, default="")
    description = models.TextField(blank=True)
    ingredients_list = models.JSONField(default=list, blank=True)
    concerns_list = models.JSONField(default=list, blank=True)
    prevents_list = models.JSONField(default=list, blank=True)
    needs_list = models.JSONField(default=list, blank=True)
    product_details = models.TextField(blank=True)
    in_depth_information = models.TextField(blank=True)
    allergic_warning = models.TextField(blank=True)
    otc_information = models.TextField(blank=True)
    habit_forming_information = models.TextField(blank=True)
    diet_lifestyle_advice = models.TextField(blank=True)
    consume_type = models.CharField(max_length=30, default="oral")
    safety_advice = models.JSONField(default=dict, blank=True)
    faqs = models.JSONField(default=dict, blank=True)
    country_of_origin = models.CharField(max_length=100, blank=True, default="")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="products", null=True, blank=True)
    strength = models.CharField(max_length=100, blank=True, default="")
    size = models.CharField(max_length=100, blank=True, default="")
    prescription_required = models.BooleanField(default=False)
    uses = models.TextField(blank=True)
    directions_for_use = models.TextField(blank=True)
    salts = models.ManyToManyField("Salt", through="MedicineSalt", related_name="medicines", blank=True)
    # Legacy summary fields retained for compatibility with existing order/cart code.
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    stock_quantity = models.PositiveIntegerField(default=0)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default="piece")
    image_url = models.URLField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        company_name = self.company.name if self.company else (self.company_name or "Generic")
        return f"{self.name} ({company_name})"

    def clean(self):
        if not self.category_id:
            return

        category_name = (self.category.name or "").strip().lower()
        if category_name in {"tablet", "capsule"}:
            if self.unit not in {"piece", "strip"}:
                raise ValidationError(
                    {"unit": "For tablet/capsule medicines, unit must be 'piece' (single) or 'strip'."}
                )

            if self.unit == "piece":
                expected = f"1 {category_name}"
                provided = (self.size or "").strip().lower()
                if provided != expected:
                    raise ValidationError({"size": f"For single {category_name}, size must be '{expected}'."})

    def update_summary_from_inventory(self):
        today = timezone.now().date()
        qs = self.inventories.filter(expiry_date__gte=today)
        agg = qs.aggregate(total_stock=Sum("stock_quantity"), min_price=Min("selling_price"))
        self.stock_quantity = agg["total_stock"] or 0
        self.price = agg["min_price"] or 0
        self.save(update_fields=["stock_quantity", "price", "updated_at"])

    @property
    def in_stock(self):
        return self.stock_quantity > 0


class Salt(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MedicineSalt(models.Model):
    medicine = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="medicine_salts")
    salt = models.ForeignKey(Salt, on_delete=models.CASCADE, related_name="salt_medicines")

    class Meta:
        unique_together = [["medicine", "salt"]]

    def __str__(self):
        return f"{self.medicine.name} - {self.salt.name}"


class Inventory(models.Model):
    medicine = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="inventories")
    batch_number = models.CharField(max_length=80)
    manufacturer = models.CharField(max_length=150, blank=True, default="")
    manufacture_date = models.DateField()
    expiry_date = models.DateField()
    location_code = models.CharField(max_length=50, blank=True, default="")
    stock_quantity = models.PositiveIntegerField(default=0)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expiry_date", "id"]
        unique_together = [["medicine", "batch_number", "location_code"]]

    def __str__(self):
        return f"{self.medicine.name} - {self.batch_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.medicine.update_summary_from_inventory()

    def delete(self, *args, **kwargs):
        medicine = self.medicine
        super().delete(*args, **kwargs)
        medicine.update_summary_from_inventory()
