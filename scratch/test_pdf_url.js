async function test() {
  try {
    const res = await fetch('https://rvdujzqsqlcgnoxioihy.supabase.co/storage/v1/object/public/menu-pdfs/menu_pdf_1788501652171.pdf');
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'));
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
