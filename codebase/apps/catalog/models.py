from django.db import models


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
    """Inventory item - medicines, cosmetics, oils, syrups, etc."""
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
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="products", null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default="piece")
    image_url = models.URLField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        company_name = self.company.name if self.company else "Generic"
        return f"{self.name} ({company_name})"

    @property
    def in_stock(self):
        return self.stock_quantity > 0
