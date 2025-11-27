# CSP (Content Security Policy) Testing

This document explains how to test that CSP is working correctly.

## What CSP Does

CSP prevents Cross-Site Scripting (XSS) attacks by:
1. Blocking inline scripts (`<script>alert('XSS')</script>`)
2. Blocking `eval()` and similar dangerous functions (in production)
3. Restricting where resources can be loaded from
4. Preventing inline event handlers (`onclick="..."`)

## Testing CSP

### 1. Check CSP Header in Browser

1. Open http://localhost:5174 (or your dev server URL)
2. Open DevTools (F12)
3. Go to Network tab
4. Reload the page
5. Click on the document (first item in Network tab)
6. Check Response Headers for `Content-Security-Policy`

You should see the CSP meta tag being applied.

### 2. Test Inline Script Blocking

Open DevTools Console and try:

```javascript
// This WILL work (console scripts are allowed)
console.log('This works');

// Create a script tag with inline code
const script = document.createElement('script');
script.textContent = 'alert("XSS attempt")';
document.body.appendChild(script);
// This should be BLOCKED by CSP in production
// (May work in dev mode due to 'unsafe-inline')
```

### 3. Test eval() Blocking

In production (with strict CSP), this should fail:

```javascript
eval('alert("XSS via eval")');
// Should throw: "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source"
```

### 4. Check CSP Violations

Open DevTools Console and look for messages like:

```
Refused to execute inline script because it violates the following Content Security Policy directive...
```

These indicate CSP is working!

## Development vs Production

### Development Mode (current)
- CSP allows `unsafe-inline` and `unsafe-eval`
- Required for Vite HMR (Hot Module Replacement)
- Provides some protection but not full XSS prevention

### Production Mode (index.prod.html)
- Strict CSP with no `unsafe-inline` or `unsafe-eval`
- Full XSS protection
- Requires building assets without inline scripts

## Production CSP Configuration

For production deployment, configure CSP via **HTTP headers** (not meta tags) in your web server:

### Nginx Example
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.yourdomain.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;" always;
```

### Express.js Example
```javascript
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.yourdomain.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;"
  );
  next();
});
```

## Additional Security Headers

Along with CSP, add these headers in production:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## CSP Reporting

To monitor CSP violations in production, add a `report-uri`:

```
Content-Security-Policy: default-src 'self'; ...; report-uri /csp-report
```

This will send violation reports to your server so you can:
1. Detect XSS attempts
2. Fix legitimate CSP violations
3. Monitor security events

## Tools

- **CSP Evaluator**: https://csp-evaluator.withgoogle.com/
- **Report URI**: https://report-uri.com/
- **Observatory by Mozilla**: https://observatory.mozilla.org/

## Current CSP Policy

### Development (index.html)
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self' http://localhost:3001 ws://localhost:*;
img-src 'self' data: https:;
font-src 'self' data:;
object-src 'none';
base-uri 'self';
form-action 'self';
```

### Production (index.prod.html - recommended)
```
default-src 'self';
script-src 'self';
style-src 'self';
connect-src 'self' https://api.yourdomain.com;
img-src 'self' data: https:;
font-src 'self' data:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

## Notes

- **Chakra UI**: Uses inline styles via Emotion, so we need `style-src 'self' 'unsafe-inline'`
- **Vite HMR**: Requires WebSocket connection, so we allow `ws://localhost:*` in dev
- **React**: All JS is bundled, so `script-src 'self'` is sufficient in production
