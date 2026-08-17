import { supabase } from './supabase'

const BUCKET_NAME = 'documentos'

/**
 * Faz o upload de um arquivo para o storage do Supabase.
 * @param file O arquivo a ser enviado.
 * @returns O caminho público do arquivo ou erro.
 */
export async function uploadDocument(file: File) {
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = fileName

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return { path: filePath, publicUrl, error: null }
  } catch (error) {
    console.error('[Storage] Erro no upload:', error)
    return { path: null, publicUrl: null, error }
  }
}

/**
 * Retorna a URL pública de um documento, limpando prefixos redundantes.
 * @param path Caminho do arquivo no storage.
 */
export function getCleanPublicUrl(path: string) {
  // Remove prefixos como 'documentos/' ou 'notas/' que podem ter sido salvos por erro
  const cleanPath = path.replace(/^(documentos\/|notas\/)/, '')
  return supabase.storage.from(BUCKET_NAME).getPublicUrl(cleanPath).data.publicUrl
}

/**
 * Remove um arquivo do storage.
 * @param path O caminho interno do arquivo no bucket.
 */
export async function deleteDocument(path: string | null | undefined) {
  if (!path) return { error: null }
  
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path])
    
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('[Storage] Erro ao deletar arquivo:', error)
    return { error }
  }
}

/**
 * Substitui um arquivo antigo por um novo.
 * @param oldPath Caminho do arquivo antigo.
 * @param newFile Novo arquivo.
 */
export async function replaceDocument(oldPath: string | null | undefined, newFile: File) {
  // 1. Faz o upload do novo
  const { path: newPath, publicUrl, error: uploadError } = await uploadDocument(newFile)
  if (uploadError) return { path: null, publicUrl: null, error: uploadError }

  // 2. Remove o antigo (Fire and forget, não bloqueia o sucesso do novo)
  if (oldPath) {
    deleteDocument(oldPath)
  }

  return { path: newPath, publicUrl, error: null }
}
