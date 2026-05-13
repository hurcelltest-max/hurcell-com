import { NextResponse } from 'next/server';
import { initializePayment } from '@/lib/iyzico';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        
        // Mock data for Iyzico
        const request = {
            locale: 'tr',
            conversationId: '123456789',
            price: body.price,
            paidPrice: body.price,
            currency: 'TRY',
            basketId: 'B67832',
            paymentGroup: 'PRODUCT',
            callbackUrl: 'https://hurcell.com/api/checkout/callback',
            enabledInstallments: [2, 3, 6, 9],
            buyer: {
                id: 'BY789',
                name: 'John',
                surname: 'Doe',
                gsmNumber: '+905350000000',
                email: 'email@email.com',
                identityNumber: '74455555555',
                lastLoginDate: '2015-10-05 12:43:35',
                registrationDate: '2013-04-21 15:12:09',
                registrationAddress: 'Nisantasi',
                ip: '85.34.78.112',
                city: 'Istanbul',
                country: 'Turkey',
                zipCode: '34732'
            },
            shippingAddress: {
                contactName: 'Jane Doe',
                city: 'Istanbul',
                country: 'Turkey',
                address: 'Nisantasi',
                zipCode: '34732'
            },
            billingAddress: {
                contactName: 'Jane Doe',
                city: 'Istanbul',
                country: 'Turkey',
                address: 'Nisantasi',
                zipCode: '34732'
            },
            basketItems: [
                {
                    id: 'BI101',
                    name: body.productName,
                    category1: 'Electronics',
                    category2: 'Accessories',
                    itemType: 'PHYSICAL',
                    price: body.price
                }
            ]
        };

        const result = await initializePayment(request);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
