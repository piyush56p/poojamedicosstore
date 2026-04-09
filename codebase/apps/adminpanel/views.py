from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.db.models import ProtectedError, Q
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Category, Company, Inventory, Product, Salt

from .models import StockBillUpload
from .stock_bill import apply_stock_bill_lines, parse_stock_bill_pdf
from apps.orders.models import Order, OrderItem
from apps.orders.utils import generate_order_number
from apps.prescriptions.models import Prescription
from .serializers import (
    ALLOWED_STATUS_TRANSITIONS,
    AdminCustomerDetailSerializer,
    StockBillUploadSerializer,
    AdminCustomerListSerializer,
    AdminCustomerUpdateSerializer,
    AdminOrderCreateSerializer,
    AdminOrderSerializer,
    AdminOrderStatusUpdateSerializer,
    AdminOrderUpdateSerializer,
    AdminPrescriptionSerializer,
    AdminInventoryCategorySerializer,
    AdminInventoryCompanySerializer,
    AdminInventoryBatchSerializer,
    AdminInventoryProductSerializer,
    AdminSaltSerializer,
)

User = get_user_model()


def _build_order_document(order, doc_type, doctor_name=""):
    items = order.items.select_related("product").all()
    product_ids = [item.product_id for item in items]
    batch_map = {}
    if product_ids:
        inventories = (
            Inventory.objects.filter(medicine_id__in=product_ids)
            .order_by("medicine_id", "expiry_date", "id")
        )
        for inv in inventories:
            if inv.medicine_id not in batch_map:
                batch_map[inv.medicine_id] = inv

    subtotal = sum((item.total_price for item in items), Decimal("0.00"))
    discount = Decimal("0.00")
    tax = Decimal("0.00")
    shipping_charge = Decimal("0.00")
    grand_total = subtotal - discount + tax + shipping_charge

    return {
        "document_type": doc_type,
        "document_number": f"{doc_type}-{order.order_number}",
        "generated_at": timezone.now(),
        "order": {
            "id": order.id,
            "order_number": order.order_number,
            "status": order.status,
            "payment_mode": getattr(order, "payment_mode", "COD"),
            "created_at": order.created_at,
            "invoice_date": timezone.now().date(),
            "doctor_name": doctor_name or "",
        },
        "customer": {
            "id": order.user_id,
            "username": order.user.username,
            "name": f"{order.user.first_name} {order.user.last_name}".strip(),
            "email": order.user.email,
            "mobile_number": order.user.mobile_number,
        },
        "shipping_address": {
            "address_line": order.shipping_address,
            "city": order.city,
            "state": order.state,
            "pincode": order.pincode,
        },
        "items": [
            {
                "id": item.id,
                "product_name": item.product.name,
                "batch_number": batch_map.get(item.product_id).batch_number if batch_map.get(item.product_id) else "",
                "manufacture_date": (
                    str(batch_map.get(item.product_id).manufacture_date) if batch_map.get(item.product_id) else ""
                ),
                "expiry_date": str(batch_map.get(item.product_id).expiry_date) if batch_map.get(item.product_id) else "",
                "manufacturer": batch_map.get(item.product_id).manufacturer if batch_map.get(item.product_id) else "",
                "quantity": item.quantity,
                "unit_price": str(item.price_at_purchase),
                "line_total": str(item.total_price),
            }
            for item in items
        ],
        "amounts": {
            "subtotal": str(subtotal),
            "discount": str(discount),
            "tax": str(tax),
            "shipping_charge": str(shipping_charge),
            "grand_total": str(grand_total),
        },
        "notes": "Computer generated document.",
    }


def _render_printable_document_html(doc):
    line_rows = "".join(
        [
            (
                "<tr>"
                f"<td>{idx}</td>"
                f"<td>{row['product_name']}</td>"
                f"<td>{row['batch_number']}</td>"
                f"<td>{row['manufacture_date']}</td>"
                f"<td>{row['expiry_date']}</td>"
                f"<td>{row['quantity']}</td>"
                f"<td>{row['unit_price']}</td>"
                f"<td>{row['line_total']}</td>"
                "</tr>"
            )
            for idx, row in enumerate(doc["items"], start=1)
        ]
    )

    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{doc['document_type']} - {doc['order']['order_number']}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; }}
    h1 {{ margin: 0 0 6px 0; }}
    .muted {{ color: #555; margin-bottom: 18px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ border: 1px solid #ccc; padding: 8px; text-align: left; }}
    th {{ background: #f4f4f4; }}
    .totals {{ margin-top: 14px; width: 320px; float: right; }}
    .totals td {{ border: none; padding: 4px 0; }}
    .right {{ text-align: right; }}
  </style>
</head>
<body onload="window.print()">
  <h1>{doc['document_type']}</h1>
  <div class="muted">{doc['document_number']}</div>
  <div><strong>Order:</strong> {doc['order']['order_number']} | <strong>Status:</strong> {doc['order']['status']}</div>
  <div><strong>Doctor:</strong> {doc['order']['doctor_name'] or '-'}</div>
  <div><strong>Date:</strong> {doc['order']['invoice_date']}</div>
  <div><strong>Customer:</strong> {doc['customer']['name'] or doc['customer']['username']} ({doc['customer']['mobile_number']})</div>
  <div><strong>Address:</strong> {doc['shipping_address']['address_line']}, {doc['shipping_address']['city']}, {doc['shipping_address']['state']} - {doc['shipping_address']['pincode']}</div>
  <table>
    <thead>
      <tr><th>#</th><th>Item</th><th>Batch</th><th>Mfg</th><th>Exp</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
    </thead>
    <tbody>{line_rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="right">{doc['amounts']['subtotal']}</td></tr>
    <tr><td>Discount</td><td class="right">{doc['amounts']['discount']}</td></tr>
    <tr><td>Tax</td><td class="right">{doc['amounts']['tax']}</td></tr>
    <tr><td>Shipping</td><td class="right">{doc['amounts']['shipping_charge']}</td></tr>
    <tr><td><strong>Grand Total</strong></td><td class="right"><strong>{doc['amounts']['grand_total']}</strong></td></tr>
  </table>
</body>
</html>
"""
    return html


def _render_order_document_pdf(doc):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise RuntimeError(
            "PDF generator dependency missing. Install reportlab: pip install reportlab"
        ) from exc

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 10 * mm
    right = width - (10 * mm)
    y = height - (12 * mm)

    # Header row
    p.setFont("Helvetica", 9)
    p.drawString(left, y, "GSTIN/UIN: 33AAAAA0000A1Z5")
    p.drawCentredString(width / 2, y, "Tax Invoice")
    p.drawRightString(right, y, "Original/Recipient")
    y -= 8 * mm

    # Logo placeholder + company section
    logo_w = 34 * mm
    logo_h = 20 * mm
    p.rect(left, y - logo_h, logo_w, logo_h)
    p.setFont("Helvetica", 8)
    p.drawCentredString(left + (logo_w / 2), y - (logo_h / 2), "LOGO SPACE")

    p.setFont("Helvetica-Bold", 16)
    p.drawString(left + logo_w + 8, y - 2 * mm, "Your Company Name")
    p.setFont("Helvetica", 9)
    p.drawString(left + logo_w + 8, y - 7 * mm, "Your Company Address, City, State, India")
    p.drawString(left + logo_w + 8, y - 12 * mm, "Mobile: +91-0000000000  Email: company@example.com")
    p.drawRightString(right, y - 12 * mm, "State Code: 33")
    y -= 24 * mm

    # Bill to + order meta
    p.line(left, y, right, y)
    y -= 6 * mm
    p.setFont("Helvetica-Bold", 10)
    p.drawString(left, y, "Bill to:")
    p.setFont("Helvetica", 9)
    customer_name = doc["customer"]["name"] or doc["customer"]["username"]
    addr = doc["shipping_address"]
    y -= 5 * mm
    p.drawString(left, y, customer_name)
    y -= 4.5 * mm
    p.drawString(left, y, f"{addr['address_line']}, {addr['city']}, {addr['state']} - {addr['pincode']}")
    y -= 4.5 * mm
    p.drawString(left, y, f"Mobile: {doc['customer']['mobile_number']}")

    meta_x = width / 2
    meta_y = y + 9 * mm
    p.drawString(meta_x, meta_y, f"Date: {doc['order']['invoice_date']}")
    p.drawString(meta_x, meta_y - 4.5 * mm, f"Invoice No: {doc['order']['order_number']}")
    p.drawString(meta_x, meta_y - 9 * mm, f"Payment Mode: {doc['order']['payment_mode']}")
    p.drawString(meta_x, meta_y - 13.5 * mm, f"Doctor: {doc['order']['doctor_name'] or '-'}")
    y -= 8 * mm

    # Items table
    table_top = y
    col_x = [
        left,              # Sr
        left + 8 * mm,     # Product
        left + 60 * mm,    # Batch
        left + 84 * mm,    # Mfg
        left + 106 * mm,   # Exp
        left + 124 * mm,   # Qty
        left + 138 * mm,   # Rate
        right,             # Amount
    ]
    p.setFont("Helvetica-Bold", 8)
    p.rect(left, table_top - 8 * mm, right - left, 8 * mm)
    p.drawString(col_x[0] + 1.5 * mm, table_top - 5.5 * mm, "Sr.")
    p.drawString(col_x[1] + 1.5 * mm, table_top - 5.5 * mm, "Product")
    p.drawString(col_x[2] + 1.5 * mm, table_top - 5.5 * mm, "Batch")
    p.drawString(col_x[3] + 1.5 * mm, table_top - 5.5 * mm, "Mfg")
    p.drawString(col_x[4] + 1.5 * mm, table_top - 5.5 * mm, "Exp")
    p.drawString(col_x[5] + 1.5 * mm, table_top - 5.5 * mm, "Qty")
    p.drawString(col_x[6] + 1.5 * mm, table_top - 5.5 * mm, "Rate")
    p.drawString(col_x[6] + 19 * mm, table_top - 5.5 * mm, "Amount")
    for cx in col_x[1:-1]:
        p.line(cx, table_top - 8 * mm, cx, table_top)

    row_h = 7 * mm
    y = table_top - 8 * mm
    p.setFont("Helvetica", 8)
    for idx, item in enumerate(doc["items"], start=1):
        if y - row_h < 35 * mm:
            p.showPage()
            y = height - 20 * mm
        p.rect(left, y - row_h, right - left, row_h)
        for cx in col_x[1:-1]:
            p.line(cx, y - row_h, cx, y)
        p.drawString(col_x[0] + 1.5 * mm, y - 4.8 * mm, str(idx))
        p.drawString(col_x[1] + 1.5 * mm, y - 4.8 * mm, item["product_name"][:28])
        p.drawString(col_x[2] + 1.5 * mm, y - 4.8 * mm, item["batch_number"][:12])
        p.drawString(col_x[3] + 1.5 * mm, y - 4.8 * mm, item["manufacture_date"][:10])
        p.drawString(col_x[4] + 1.5 * mm, y - 4.8 * mm, item["expiry_date"][:10])
        p.drawRightString(col_x[6] - 1.5 * mm, y - 4.8 * mm, str(item["quantity"]))
        p.drawRightString(right - 26 * mm, y - 4.8 * mm, item["unit_price"])
        p.drawRightString(right - 1.5 * mm, y - 4.8 * mm, item["line_total"])
        y -= row_h

    # Totals
    y -= 4 * mm
    p.setFont("Helvetica-Bold", 9)
    p.drawRightString(right - 1.5 * mm, y, f"Subtotal: {doc['amounts']['subtotal']}")
    y -= 4.5 * mm
    p.drawRightString(right - 1.5 * mm, y, f"Discount: {doc['amounts']['discount']}")
    y -= 4.5 * mm
    p.drawRightString(right - 1.5 * mm, y, f"Tax: {doc['amounts']['tax']}")
    y -= 4.5 * mm
    p.drawRightString(right - 1.5 * mm, y, f"Grand Total: {doc['amounts']['grand_total']}")

    # Footer sign boxes
    y -= 12 * mm
    p.setFont("Helvetica", 8)
    p.line(left, y, left + 55 * mm, y)
    p.drawString(left, y - 4 * mm, "Receiver Signature")
    p.line(right - 60 * mm, y, right, y)
    p.drawString(right - 58 * mm, y - 4 * mm, "Authorised Signatory")

    p.save()
    pdf = buffer.getvalue()
    buffer.close()
    return pdf


class AdminCustomerListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = User.objects.all().order_by("-date_joined")
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role.upper())
        serializer = AdminCustomerListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminCustomerDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return (
            User.objects.filter(pk=pk)
            .prefetch_related("addresses", "prescriptions", "orders__items__product")
            .first()
        )

    def get(self, request, pk):
        customer = self.get_object(pk)
        if not customer:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminCustomerDetailSerializer(customer)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        customer = self.get_object(pk)
        if not customer:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminCustomerUpdateSerializer(customer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminCustomerDetailSerializer(customer).data, status=status.HTTP_200_OK)


class AdminPrescriptionListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Prescription.objects.select_related("user").order_by("-uploaded_at")
        customer_id = request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(user_id=customer_id)
        serializer = AdminPrescriptionSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminPrescriptionDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Prescription.objects.select_related("user").filter(pk=pk).first()

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminPrescriptionSerializer(obj).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        status_value = request.data.get("status")
        allowed = {"PENDING", "APPROVED", "REJECTED", "PROCESSED"}
        if status_value:
            normalized = str(status_value).upper().strip()
            if normalized not in allowed:
                return Response({"detail": "Invalid prescription status."}, status=status.HTTP_400_BAD_REQUEST)
            obj.status = normalized
            obj.reviewed_at = timezone.now()
            obj.save(update_fields=["status", "reviewed_at"])
        return Response(AdminPrescriptionSerializer(obj).data, status=status.HTTP_200_OK)


class AdminOrderListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Order.objects.select_related("user").prefetch_related("items__product").order_by("-created_at")
        customer_id = request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(user_id=customer_id)
        serializer = AdminOrderSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        user = payload["user"]
        items = payload["items"]

        with transaction.atomic():
            order = Order.objects.create(
                user=user,
                order_number=generate_order_number(),
                status="PENDING",
                payment_mode=payload.get("payment_mode", "COD"),
                total_amount=0,
                shipping_address=payload["shipping_address"],
                city=payload["city"],
                state=payload["state"],
                pincode=payload["pincode"],
            )
            total = 0
            for item in items:
                product = item["product"]
                quantity = item["quantity"]
                product = type(product).objects.select_for_update().get(pk=product.pk)
                if product.stock_quantity < quantity:
                    raise serializers.ValidationError(
                        {"detail": f"Insufficient stock for {product.name}. Available: {product.stock_quantity}"}
                    )
                product.stock_quantity -= quantity
                product.save(update_fields=["stock_quantity"])

                line_total = product.price * quantity
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    price_at_purchase=product.price,
                    total_price=line_total,
                )
                total += line_total
            order.total_amount = total
            order.save(update_fields=["total_amount"])

        out = AdminOrderSerializer(Order.objects.select_related("user").prefetch_related("items__product").get(pk=order.pk))
        return Response(out.data, status=status.HTTP_201_CREATED)


class AdminOrderDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminOrderSerializer(obj).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminOrderUpdateSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        new_items = validated.pop("items", None)

        with transaction.atomic():
            serializer.save()

            if new_items is not None:
                # Restore stock from existing order lines before replacing.
                for existing_item in obj.items.select_related("product").all():
                    product = existing_item.product
                    product.stock_quantity += existing_item.quantity
                    product.save(update_fields=["stock_quantity"])

                obj.items.all().delete()

                total = 0
                for item in new_items:
                    product = item["product"]
                    quantity = item["quantity"]
                    product = type(product).objects.select_for_update().get(pk=product.pk)
                    if product.stock_quantity < quantity:
                        raise serializers.ValidationError(
                            {"detail": f"Insufficient stock for {product.name}. Available: {product.stock_quantity}"}
                        )
                    product.stock_quantity -= quantity
                    product.save(update_fields=["stock_quantity"])

                    line_total = product.price * quantity
                    OrderItem.objects.create(
                        order=obj,
                        product=product,
                        quantity=quantity,
                        price_at_purchase=product.price,
                        total_price=line_total,
                    )
                    total += line_total

                obj.total_amount = total
                obj.save(update_fields=["total_amount", "updated_at"])

            if hasattr(obj, "payment"):
                obj.payment.amount = obj.total_amount
                obj.payment.save(update_fields=["amount"])

        refreshed = self.get_object(pk)
        return Response(AdminOrderSerializer(refreshed).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            for item in obj.items.select_related("product").all():
                product = item.product
                product.stock_quantity += item.quantity
                product.save(update_fields=["stock_quantity"])
            obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminOrderStatusUpdateView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_status = serializer.validated_data["status"]
        current = order.status

        if next_status == current:
            return Response(AdminOrderSerializer(order).data, status=status.HTTP_200_OK)

        allowed_next = ALLOWED_STATUS_TRANSITIONS.get(current, set())
        if next_status not in allowed_next:
            return Response(
                {"detail": f"Invalid status transition: {current} -> {next_status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = next_status
        order.save(update_fields=["status", "updated_at"])
        return Response(AdminOrderSerializer(order).data, status=status.HTTP_200_OK)


class AdminInventoryProductListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Product.objects.select_related("category", "company").order_by("-updated_at")

        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(batch_number__icontains=search)
                | Q(company_name__icontains=search)
                | Q(description__icontains=search)
                | Q(category__name__icontains=search)
                | Q(company__name__icontains=search)
                | Q(salts__name__icontains=search)
            )

        category_id = request.query_params.get("category")
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        company_id = request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        is_active = request.query_params.get("is_active")
        if is_active is not None:
            if str(is_active).lower() in {"1", "true", "yes"}:
                queryset = queryset.filter(is_active=True)
            elif str(is_active).lower() in {"0", "false", "no"}:
                queryset = queryset.filter(is_active=False)

        in_stock = request.query_params.get("in_stock")
        if in_stock is not None:
            if str(in_stock).lower() in {"1", "true", "yes"}:
                queryset = queryset.filter(stock_quantity__gt=0)
            elif str(in_stock).lower() in {"0", "false", "no"}:
                queryset = queryset.filter(stock_quantity=0)

        serializer = AdminInventoryProductSerializer(queryset.distinct(), many=True)
        return Response({"count": len(serializer.data), "results": serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminInventoryProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(AdminInventoryProductSerializer(product).data, status=status.HTTP_201_CREATED)


class AdminInventoryProductDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Product.objects.select_related("category", "company").filter(pk=pk).first()

    def get(self, request, pk):
        product = self.get_object(pk)
        if not product:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminInventoryProductSerializer(product).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        product = self.get_object(pk)
        if not product:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminInventoryProductSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminInventoryProductSerializer(product).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        product = self.get_object(pk)
        if not product:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            product.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete product because it is referenced by existing orders."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminInventoryCategoryListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Category.objects.all().order_by("name")
        serializer = AdminInventoryCategorySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminInventoryCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(AdminInventoryCategorySerializer(category).data, status=status.HTTP_201_CREATED)


class AdminInventoryCategoryDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Category.objects.filter(pk=pk).first()

    def patch(self, request, pk):
        category = self.get_object(pk)
        if not category:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminInventoryCategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminInventoryCategorySerializer(category).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        category = self.get_object(pk)
        if not category:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            category.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete category because products are assigned to it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminInventoryCompanyListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Company.objects.all().order_by("name")
        serializer = AdminInventoryCompanySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminInventoryCompanySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = serializer.save()
        return Response(AdminInventoryCompanySerializer(company).data, status=status.HTTP_201_CREATED)


class AdminInventoryCompanyDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Company.objects.filter(pk=pk).first()

    def patch(self, request, pk):
        company = self.get_object(pk)
        if not company:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminInventoryCompanySerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminInventoryCompanySerializer(company).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        company = self.get_object(pk)
        if not company:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            company.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete company because products are assigned to it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminInventoryBatchListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Inventory.objects.select_related("medicine").order_by("expiry_date", "id")
        medicine_id = request.query_params.get("medicine")
        if medicine_id:
            queryset = queryset.filter(medicine_id=medicine_id)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(batch_number__icontains=search)
                | Q(location_code__icontains=search)
                | Q(manufacturer__icontains=search)
                | Q(medicine__name__icontains=search)
                | Q(medicine__sku__icontains=search)
            )
        serializer = AdminInventoryBatchSerializer(queryset, many=True)
        return Response({"count": len(serializer.data), "results": serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminInventoryBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(AdminInventoryBatchSerializer(obj).data, status=status.HTTP_201_CREATED)


class AdminInventoryBatchDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Inventory.objects.select_related("medicine").filter(pk=pk).first()

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminInventoryBatchSerializer(obj).data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminInventoryBatchSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminInventoryBatchSerializer(obj).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminSaltListCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = Salt.objects.all().order_by("name")
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        serializer = AdminSaltSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AdminSaltSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(AdminSaltSerializer(obj).data, status=status.HTTP_201_CREATED)


class AdminSaltDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_object(self, pk):
        return Salt.objects.filter(pk=pk).first()

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminSaltSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminSaltSerializer(obj).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminOrderBillView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="BILL", doctor_name=request.query_params.get("doctor_name", ""))
        return Response(doc, status=status.HTTP_200_OK)


class AdminOrderBillPrintView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="BILL", doctor_name=request.query_params.get("doctor_name", ""))
        html = _render_printable_document_html(doc)
        return HttpResponse(html, content_type="text/html")


class AdminOrderReceiptView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="RECEIPT", doctor_name=request.query_params.get("doctor_name", ""))
        return Response(doc, status=status.HTTP_200_OK)


class AdminOrderReceiptPrintView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="RECEIPT", doctor_name=request.query_params.get("doctor_name", ""))
        html = _render_printable_document_html(doc)
        return HttpResponse(html, content_type="text/html")


class AdminOrderBillDownloadView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="BILL", doctor_name=request.query_params.get("doctor_name", ""))
        try:
            pdf_bytes = _render_order_document_pdf(doc)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="bill_{order.order_number}.pdf"'
        return response


class AdminOrderReceiptDownloadView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        order = Order.objects.select_related("user").prefetch_related("items__product").filter(pk=pk).first()
        if not order:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        doc = _build_order_document(order, doc_type="RECEIPT", doctor_name=request.query_params.get("doctor_name", ""))
        try:
            pdf_bytes = _render_order_document_pdf(doc)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="receipt_{order.order_number}.pdf"'
        return response


class StockBillUploadView(APIView):
    """POST: Upload a wholesaler stock bill PDF to update inventory."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        pdf_file = request.FILES.get("file") or request.FILES.get("pdf")
        if not pdf_file:
            return Response(
                {"detail": "No PDF file provided. Use form field 'file' or 'pdf'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (pdf_file.name or "").lower().endswith(".pdf"):
            return Response(
                {"detail": "File must be a PDF."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload = StockBillUpload.objects.create(
            pdf_file=pdf_file,
            original_filename=pdf_file.name or "",
            status="processing",
        )

        try:
            upload.pdf_file.open("rb")
            pdf_bytes = upload.pdf_file.read()
            upload.pdf_file.close()
        except Exception as e:
            upload.status = "failed"
            upload.error_message = str(e)
            upload.save(update_fields=["status", "error_message"])
            return Response(
                {"detail": f"Failed to read file: {e}", "upload_id": upload.id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lines, parse_error = parse_stock_bill_pdf(pdf_bytes)
        if parse_error:
            upload.status = "failed"
            upload.error_message = parse_error
            upload.save(update_fields=["status", "error_message"])
            return Response(
                {"detail": parse_error, "upload_id": upload.id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        default_category_id = request.data.get("default_category_id")
        summary = apply_stock_bill_lines(lines, default_category_id=default_category_id)
        upload.result_summary = summary
        upload.parsed_lines = lines
        upload.status = "completed"
        upload.processed_at = timezone.now()
        upload.save(update_fields=["result_summary", "parsed_lines", "status", "processed_at"])

        return Response(
            {
                "upload_id": upload.id,
                "status": "completed",
                "result_summary": summary,
                "message": (
                    f"Processed {summary['lines_processed']} lines: "
                    f"{summary['batches_updated']} batches updated, "
                    f"{summary['batches_created']} new batches, "
                    f"{summary['products_created']} new products."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class StockBillUploadListView(APIView):
    """GET: List all stock bill uploads."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = StockBillUpload.objects.all().order_by("-uploaded_at")
        serializer = StockBillUploadSerializer(queryset, many=True)
        return Response({"count": queryset.count(), "results": serializer.data}, status=status.HTTP_200_OK)


class StockBillUploadDetailView(APIView):
    """GET: Retrieve a single stock bill upload with result summary."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        upload = StockBillUpload.objects.filter(pk=pk).first()
        if not upload:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = StockBillUploadSerializer(upload)
        return Response(serializer.data, status=status.HTTP_200_OK)

