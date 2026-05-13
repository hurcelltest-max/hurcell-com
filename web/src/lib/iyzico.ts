import Iyzipay from 'iyzipay';

export const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || 'sandbox-key',
    secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-secret',
    uri: 'https://sandbox-api.iyzipay.com'
});

export const initializePayment = (data: any) => {
    return new Promise((resolve, reject) => {
        iyzipay.checkoutFormInitialize.create(data, (err: any, result: any) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};
