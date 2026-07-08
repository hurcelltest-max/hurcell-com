import React from 'react'
import fs from 'fs'
import path from 'path'
import { CheckCircle, ShieldAlert } from 'lucide-react'

export const metadata = {
  title: 'Limitli Alışveriş ve Cari Hesap Sözleşmesi | HurCELL',
  description: 'HurCELL mağazalarından yapılacak limitli alışveriş (veresiye) işlemlerinin genel şartları.',
}

export default async function LimitliAlisverisSozlesmesiPage() {
  // Read the markdown file
  const filePath = path.join(process.cwd(), 'src', 'content', 'agreements', 'limitli-alisveris-2026-07-v1.md')
  let contractContent = ''
  let errorMsg = ''
  
  try {
    contractContent = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    console.error('Error reading contract markdown:', err)
    errorMsg = 'Sözleşme metni yüklenirken bir hata oluştu.'
  }

  // Simple markdown parser for display
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-2xl font-bold text-gray-900 mb-6">{line.replace('# ', '')}</h1>
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-xl font-semibold text-gray-800 mt-8 mb-4">{line.replace('## ', '')}</h2>
      }
      if (line.startsWith('**')) {
        const strongText = line.replaceAll('**', '')
        return <p key={idx} className="font-semibold text-gray-700 mb-4">{strongText}</p>
      }
      if (line.trim() === '') {
        return <br key={idx} />
      }
      return <p key={idx} className="text-gray-600 mb-2 leading-relaxed">{line}</p>
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-6 py-8 text-white">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-8 h-8 text-blue-100" />
              <h1 className="text-2xl font-bold">Hukuki Sözleşme</h1>
            </div>
            <p className="text-blue-100">Lütfen alışveriş limitiniz tanımlanmadan önce aşağıdaki şartları okuyunuz.</p>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-10">
            {errorMsg ? (
              <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                {errorMsg}
              </div>
            ) : (
              <div className="prose prose-blue max-w-none">
                {renderMarkdown(contractContent)}
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="bg-gray-50 border-t border-gray-100 p-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3 text-sm text-gray-500">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p>Bu sözleşme mağazalarımızda tarafınıza gönderilecek SMS doğrulama kodu (OTP) ile dijital ortamda onaylanacaktır.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
