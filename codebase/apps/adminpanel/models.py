from django.db import models


class StockBillUpload(models.Model):
    """Tracks admin uploads of wholesaler stock bill PDFs for inventory update."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    pdf_file = models.FileField(upload_to="stock_bills/%Y/%m/%d/", blank=True, null=True)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    # Summary after processing: lines_parsed, batches_updated, batches_created, products_created, errors
    result_summary = models.JSONField(default=dict, blank=True)
    # Optional: parsed line items (for audit/debug)
    parsed_lines = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"StockBill {self.id} ({self.status}) {self.original_filename or 'no file'}"
