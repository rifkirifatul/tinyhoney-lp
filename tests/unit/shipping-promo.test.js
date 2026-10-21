/**
 * Promo ongkir: 100% discount, capped at Rp10.000, minimum 2 bottles.
 * TinyHoney unit price is Rp99.000.
 */

const {
  CHECKOUT_CONFIG,
  computeShippingDiscount,
  computeShippingPaid,
  buildOrderPayload
} = require('../../js/main.js');

describe('shipping promo', () => {
  test('no discount for a single bottle', () => {
    expect(computeShippingDiscount(15000, 1)).toBe(0);
    expect(computeShippingPaid(15000, 1)).toBe(15000);
  });

  test('100% discount up to Rp10.000 for 2+ bottles', () => {
    expect(computeShippingDiscount(5000, 2)).toBe(5000);
    expect(computeShippingPaid(5000, 2)).toBe(0);

    expect(computeShippingDiscount(15000, 2)).toBe(10000);
    expect(computeShippingPaid(15000, 2)).toBe(5000);

    expect(computeShippingDiscount(15000, 3)).toBe(10000);
    expect(computeShippingPaid(15000, 3)).toBe(5000);
  });

  test('the amount is product total plus discounted shipping', () => {
    const payload = buildOrderPayload({
      customer_name: 'Test Buyer',
      phone: '081234567890',
      address: 'Jl. Test No. 1',
      quantity: 2,
      payment_method: 'SP',
      shipping_cost: 15000,
      postal_code: '40286',
      sub_district_name: 'Manjahlega'
    });

    expect(CHECKOUT_CONFIG.unitPrice).toBe(99000);
    expect(payload.subtotal).toBe(198000);
    expect(payload.shipping_cost).toBe(15000);
    expect(payload.shipping_discount).toBe(10000);
    expect(payload.shipping_paid).toBe(5000);
    expect(payload.amount).toBe(203000);
  });

  test('a stale shipping discount cannot lower the amount', () => {
    const payload = buildOrderPayload({
      customer_name: 'Test Buyer',
      phone: '081234567890',
      address: 'Jl. Test No. 1',
      quantity: 2,
      payment_method: 'SP',
      shipping_cost: 15000,
      shipping_discount: 15000,
      shipping_paid: 0,
      postal_code: '40286',
      sub_district_name: 'Manjahlega'
    });

    expect(payload.shipping_discount).toBe(10000);
    expect(payload.shipping_paid).toBe(5000);
    expect(payload.amount).toBe(203000);
  });
});
