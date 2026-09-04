import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'products';

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 });
    }

    // 1. Asegurar que el bucket exista y sea público
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = (buckets || []).some((b) => b.name === bucket);
      if (!exists) {
        await supabase.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 26214400, // 25MB
        });
      }
    } catch {
      // Ignorar si no se tienen permisos de administración de buckets
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const isPdf = fileExt === 'pdf' || file.type === 'application/pdf';
    const resolvedContentType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');
    const fileName = bucket === 'menu-pdfs'
      ? `menu_pdf_${Date.now()}.${fileExt}`
      : `uploads/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Subir a Supabase Storage con Service Role (sin problemas de RLS)
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType: resolvedContentType,
        upsert: true,
      });

    if (uploadError) {
      console.warn('[Storage Upload API] Storage upload warning:', uploadError.message);
      if (isPdf) {
        return NextResponse.json({ error: `Error al subir PDF: ${uploadError.message}` }, { status: 500 });
      }
      // Fallback a Base64 si es imagen y el storage no permite la subida
      const base64 = `data:${resolvedContentType};base64,${buffer.toString('base64')}`;
      return NextResponse.json({ url: base64, fallback: true });
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return NextResponse.json({
      url: publicData.publicUrl,
      fileName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al subir imagen';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
