import axios from 'axios';

interface HitPayPaymentParams {
  amount: number | string;
  currency: string;
  reference: string;
  customerEmail: string;
  customerName: string;
}

export const createHitPayPaymentRequest = async (
  params: HitPayPaymentParams
) => {
  try {
    const apiKey = process.env.HITPAY_API_KEY;
    const isSandbox = process.env.HITPAY_MODE === 'sandbox' || true;

    const baseUrl = isSandbox
      ? 'https://api.sandbox.hit-pay.com/v1/payment-requests'
      : 'https://api.hit-pay.com/v1/payment-requests';

    const formParams = new URLSearchParams();

    formParams.append('amount', String(params.amount));
    formParams.append('currency', params.currency);
    formParams.append('email', params.customerEmail);
    formParams.append('name', params.customerName);
    formParams.append('reference_number', params.reference);
    formParams.append(
      'redirect_url',
      'http://localhost:3000/api/payment-complete'
    );

    const response = await axios.post(baseUrl, formParams, {
      headers: {
        'X-BUSINESS-API-KEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    console.log('HITPAY RESPONSE');
    console.log(response.data);

    return response.data;
  } catch (error: any) {
    console.error(
      'HitPay create payment error:',
      error.response?.data || error.message
    );

    throw new Error('Failed to create payment request');
  }
};