# Duitku connectivity / credential diagnostic.
#
# Run from the repository root:
#   .\scripts\duitku-diagnose.ps1 -Environment sandbox -Mode methods
#   .\scripts\duitku-diagnose.ps1 -Environment sandbox -Mode inquiry -PaymentMethod BC -Amount 198000
#   .\scripts\duitku-diagnose.ps1 -Environment sandbox -Mode inquiry -PaymentMethod SP -Amount 198000
#
# The API key is prompted as a secure string. Nothing is written to disk.
# Inquiry mode creates a sandbox transaction; you can ignore the payment URL.

[CmdletBinding()]
param(
  [string]$MerchantCode = "",
  [string]$ApiKey = "",
  [ValidateSet("sandbox", "production")]
  [string]$Environment = "sandbox",
  [ValidateSet("methods", "inquiry")]
  [string]$Mode = "methods",
  [string]$PaymentMethod = "BC",
  [int]$Amount = 10000
)

if (-not $MerchantCode) {
  $MerchantCode = Read-Host "Duitku merchant code"
}

if (-not $ApiKey) {
  $secure = Read-Host "Duitku API key" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not $MerchantCode -or -not $ApiKey) {
  throw "Merchant code and API key are required."
}

$base = if ($Environment -eq "production") {
  "https://passport.duitku.com"
} else {
  "https://sandbox.duitku.com"
}

$hmac = [System.Security.Cryptography.HMACSHA256]::new(
  [Text.Encoding]::UTF8.GetBytes($ApiKey)
)

function Get-DuitkuSignature([string]$value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($value)
  return ([BitConverter]::ToString($hmac.ComputeHash($bytes)) -replace "-", "").ToLowerInvariant()
}

$watch = [Diagnostics.Stopwatch]::StartNew()

if ($Mode -eq "methods") {
  $datetime = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $signature = Get-DuitkuSignature "$MerchantCode$Amount$datetime"
  $payload = @{
    merchantcode = $MerchantCode
    amount = $Amount
    datetime = $datetime
    signature = $signature
  } | ConvertTo-Json
  $url = "$base/webapi/api/merchant/paymentmethod/getpaymentmethod"
} else {
  $orderId = "DIAG-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $signature = Get-DuitkuSignature "$MerchantCode$orderId$Amount"

  # ArrayList keeps a single item serialized as a JSON array in Windows
  # PowerShell 5.1 (a one-element @() would be unwrapped to an object).
  $itemDetails = New-Object System.Collections.ArrayList
  [void]$itemDetails.Add(@{
    name = "Duitku diagnostic"
    price = $Amount
    quantity = 1
  })

  $payload = @{
    merchantCode = $MerchantCode
    paymentAmount = $Amount
    paymentMethod = $PaymentMethod
    merchantOrderId = $orderId
    productDetails = "Duitku diagnostic"
    additionalParam = ""
    merchantUserInfo = ""
    customerVaName = "Diagnostic"
    email = "admin@tinyhoney.id"
    phoneNumber = "08123456789"
    itemDetails = $itemDetails
    customerDetail = @{
      firstName = "Diagnostic"
      lastName = ""
      email = "admin@tinyhoney.id"
      phoneNumber = "08123456789"
      billingAddress = @{
        firstName = "Diagnostic"
        lastName = ""
        address = "Jl. Diagnostic No. 1"
        city = "Bandung"
        postalCode = "40194"
        phone = "08123456789"
        countryCode = "ID"
      }
      shippingAddress = @{
        firstName = "Diagnostic"
        lastName = ""
        address = "Jl. Diagnostic No. 1"
        city = "Bandung"
        postalCode = "40194"
        phone = "08123456789"
        countryCode = "ID"
      }
    }
    callbackUrl = "https://example.com/callback"
    returnUrl = "https://example.com/return"
    signature = $signature
    expiryPeriod = 10
  } | ConvertTo-Json -Depth 8
  $url = "$base/webapi/api/merchant/v2/inquiry"
}

Write-Host "POST $url"
Write-Host "env=$Environment mode=$Mode method=$PaymentMethod amount=$Amount"

try {
  $response = Invoke-WebRequest -Uri $url -Method POST `
    -ContentType "application/json" -Body $payload -TimeoutSec 30 -UseBasicParsing
  $watch.Stop()
  Write-Host "HTTP $($response.StatusCode) in $($watch.ElapsedMilliseconds) ms"
  Write-Host $response.Content
} catch {
  $watch.Stop()
  Write-Host "ERROR after $($watch.ElapsedMilliseconds) ms: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    try {
      $reader = [IO.StreamReader]::new(
        $_.Exception.Response.GetResponseStream()
      )
      Write-Host $reader.ReadToEnd()
    } catch {
      # Ignore response-body read failures.
    }
  }
}
