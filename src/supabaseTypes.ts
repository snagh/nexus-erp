export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      financeiro_documentos: {
        Row: {
          id: number
          tipo: 'ATESTO' | 'NF'
          numero: string
          data: string
          empresa: 'APROMEDICA' | 'ROSAFARM'
          entidade_id: string | null
          valor: number
          observacao: string | null
          vendedor_id: string | null
          historico_entrega_numero: string | null
          vinculo_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          tipo: 'ATESTO' | 'NF'
          numero: string
          data: string
          empresa: 'APROMEDICA' | 'ROSAFARM'
          entidade_id?: string | null
          valor: number
          observacao?: string | null
          vendedor_id?: string | null
          historico_entrega_numero?: string | null
          vinculo_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          tipo?: 'ATESTO' | 'NF'
          numero?: string
          data?: string
          empresa?: 'APROMEDICA' | 'ROSAFARM'
          entidade_id?: string | null
          valor?: number
          observacao?: string | null
          vendedor_id?: string | null
          historico_entrega_numero?: string | null
          vinculo_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_documentos_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_documentos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notas: {
        Row: {
          id: number
          numero_empenho: string
          numero_ne: string
          emissor: string | null
          tipo_documento: string | null
          data_emissao: string | null
          owner_id: string | null
          assigned_to: string | null
          distributed_at: string | null
          confirmed_at: string | null
          status_carga: string | null
          valor_total_teto: number | null
          data_recebimento: string | null
          previsao_entrega: string | null
          data_prazo_compras: string | null
          arquivo_caminho: string | null
          uf: string | null
          status_geral: string | null
          created_at: string
          updated_at: string | null
          setor_id: number | null
          entidade_id: number | null
          ata_id: string | null
          setor: string | null
          marcado_compras: boolean | null
          contrato_id: string | null
          modo_sesau: boolean | null
          e_notificacao: boolean | null
          arquivo_notificacao: string | null
          demanda_judicial: boolean | null
          arquivo_demanda_judicial: string | null
          numero_pedido: string | null
          foi_notificado: boolean | null
        }
        Insert: {
          id?: number
          numero_empenho?: string
          numero_ne?: string
          emissor?: string | null
          tipo_documento?: string | null
          data_emissao?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          distributed_at?: string | null
          confirmed_at?: string | null
          status_carga?: string | null
          valor_total_teto?: number | null
          data_recebimento?: string | null
          previsao_entrega?: string | null
          data_prazo_compras?: string | null
          arquivo_caminho?: string | null
          uf?: string | null
          status_geral?: string | null
          created_at?: string
          updated_at?: string | null
          setor_id?: number | null
          entidade_id?: number | null
          ata_id?: string | null
          setor?: string | null
          marcado_compras?: boolean | null
          contrato_id?: string | null
          modo_sesau?: boolean | null
          e_notificacao?: boolean | null
          arquivo_notificacao?: string | null
          demanda_judicial?: boolean | null
          arquivo_demanda_judicial?: string | null
          numero_pedido?: string | null
          foi_notificado?: boolean | null
        }
        Update: {
          id?: number
          numero_empenho?: string
          numero_ne?: string
          emissor?: string | null
          tipo_documento?: string | null
          data_emissao?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          distributed_at?: string | null
          confirmed_at?: string | null
          status_carga?: string | null
          valor_total_teto?: number | null
          data_recebimento?: string | null
          previsao_entrega?: string | null
          data_prazo_compras?: string | null
          arquivo_caminho?: string | null
          uf?: string | null
          status_geral?: string | null
          created_at?: string
          updated_at?: string | null
          setor_id?: number | null
          entidade_id?: number | null
          ata_id?: string | null
          setor?: string | null
          marcado_compras?: boolean | null
          contrato_id?: string | null
          modo_sesau?: boolean | null
          e_notificacao?: boolean | null
          arquivo_notificacao?: string | null
          demanda_judicial?: boolean | null
          arquivo_demanda_judicial?: string | null
          numero_pedido?: string | null
          foi_notificado?: boolean | null
        }
        Relationships: []
      }
      itens: {
        Row: {
          id: number
          nota_id: number | null
          descricao: string
          quantidade: number
          valor_unitario: number
          unidade: string | null
          categoria: string | null
          subcategoria: string | null
          marca: string | null
          mapeamento_ia: string | null
          status_item: string | null
          item_ata_id: number | null
          marcado_compras: boolean | null
          item_contrato_id: string | null
          created_at: string
          produto_catalogo_id: number | null
        }
        Insert: {
          id?: number
          nota_id?: number | null
          descricao: string
          quantidade: number
          valor_unitario: number
          unidade?: string | null
          categoria?: string | null
          subcategoria?: string | null
          marca?: string | null
          mapeamento_ia?: string | null
          status_item?: string | null
          item_ata_id?: number | null
          marcado_compras?: boolean | null
          item_contrato_id?: string | null
          created_at?: string
          produto_catalogo_id?: number | null
        }
        Update: {
          id?: number
          nota_id?: number | null
          descricao?: string
          quantidade?: number
          valor_unitario?: number
          unidade?: string | null
          categoria?: string | null
          subcategoria?: string | null
          marca?: string | null
          mapeamento_ia?: string | null
          status_item?: string | null
          item_ata_id?: number | null
          marcado_compras?: boolean | null
          item_contrato_id?: string | null
          created_at?: string
          produto_catalogo_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_item_ata_id_fkey"
            columns: ["item_ata_id"]
            isOneToOne: false
            referencedRelation: "itens_ata"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas"
            referencedColumns: ["id"]
          }
        ]
      }
      atas: {
        Row: {
          id: string
          numero_arp: string
          entidade_gerenciadora: string | null
          entidade_id: number | null
          valor_global: number | null
          data_validade: string | null
          arquivo_caminho: string | null
          uf: string | null
          status: string | null
          owner_id: string | null
          assigned_to: string | null
          distributed_at: string | null
          municipio: string | null
          objeto_ata: string | null
          subcategoria: string | null
          tipo_documento: string | null
          parent_ata_id: string | null
          data_assinatura: string | null
          created_at: string
        }
        Insert: {
          id?: string
          numero_arp: string
          entidade_gerenciadora?: string | null
          entidade_id?: number | null
          valor_global?: number | null
          data_validade?: string | null
          arquivo_caminho?: string | null
          uf?: string | null
          status?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          distributed_at?: string | null
          municipio?: string | null
          objeto_ata?: string | null
          subcategoria?: string | null
          tipo_documento?: string | null
          parent_ata_id?: string | null
          data_assinatura?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          numero_arp?: string
          entidade_gerenciadora?: string | null
          entidade_id?: number | null
          valor_global?: number | null
          data_validade?: string | null
          arquivo_caminho?: string | null
          uf?: string | null
          status?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          distributed_at?: string | null
          municipio?: string | null
          objeto_ata?: string | null
          subcategoria?: string | null
          tipo_documento?: string | null
          parent_ata_id?: string | null
          data_assinatura?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atas_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      itens_ata: {
        Row: {
          id: number
          ata_id: string
          numero_item: string | number
          descricao: string
          unidade: string | null
          quantidade_registrada: number
          valor_unitario: number
          quantidade_abatida: number | null
          marca: string | null
          mapeamento_ia: string | null
          categoria: string | null
          subcategoria: string | null
          produto_catalogo_id: number | null
        }
        Insert: {
          id?: number
          ata_id: string
          numero_item: string | number
          descricao: string
          unidade?: string | null
          quantidade_registrada: number
          valor_unitario: number
          quantidade_abatida?: number | null
          marca?: string | null
          mapeamento_ia?: string | null
          categoria?: string | null
          subcategoria?: string | null
          produto_catalogo_id?: number | null
        }
        Update: {
          id?: number
          ata_id?: string
          numero_item?: string | number
          descricao?: string
          unidade?: string | null
          quantidade_registrada?: number
          valor_unitario?: number
          quantidade_abatida?: number | null
          marca?: string | null
          mapeamento_ia?: string | null
          categoria?: string | null
          subcategoria?: string | null
          produto_catalogo_id?: number | null
        }
        Relationships: []
      }
      historico_entregas: {
        Row: {
          id: number
          item_id: number | null
          item_ata_id: number | null
          quantidade_entregue: number
          data_entrega: string | null
          venda_tipo: string | null
          vendedor_id: string | null
          motivo_pendencia: string | null
          numero_nf: string | null
          arquivo_nf_caminho: string | null
          created_at: string
          itens_entregues: boolean
          e_dia_d: boolean | null
        }
        Insert: {
          id?: number
          item_id?: number | null
          item_ata_id?: number | null
          quantidade_entregue: number
          data_entrega?: string | null
          venda_tipo?: string | null
          vendedor_id?: string | null
          motivo_pendencia?: string | null
          numero_nf?: string | null
          arquivo_nf_caminho?: string | null
          created_at?: string
          itens_entregues?: boolean
          e_dia_d?: boolean | null
        }
        Update: {
          id?: number
          item_id?: number | null
          item_ata_id?: number | null
          quantidade_entregue?: number
          data_entrega?: string | null
          venda_tipo?: string | null
          vendedor_id?: string | null
          motivo_pendencia?: string | null
          numero_nf?: string | null
          arquivo_nf_caminho?: string | null
          created_at?: string
          itens_entregues?: boolean
          e_dia_d?: boolean | null
        }
        Relationships: []
      }
      pedidos_compra: {
        Row: {
          id: number
          item_id: number | null
          item_ata_id: number | null
          quantidade_solicitada: number
          status: string
          usuario_solicitante: string | null
          observacoes: string | null
          prazo_limite: string | null
          assigned_to: string | null
          created_at: string
          produto_catalogo_id: number | null
          solicitante_id: string | null
          categoria: string | null
          valor_unitario_comprado: number | null
          marca_comprada: string | null
          prazo_estimado_chegada: string | null
          e_notificacao: boolean | null
          arquivo_notificacao: string | null
          demanda_judicial: boolean | null
          arquivo_demanda_judicial: string | null
          data_notificacao: string | null
          justificativa_exclusao: string | null
          excluido_por_nome: string | null
          excluido_em: string | null
          empenho_excluido_por: string | null
          empenho_excluido_motivo: string | null
          empenho_excluido_em: string | null
          empenho_numero_legado: string | null
          item_descricao_legado: string | null
          nota_id: number | null
        }
        Insert: {
          id?: number
          item_id?: number | null
          item_ata_id?: number | null
          quantidade_solicitada: number
          status?: string
          usuario_solicitante?: string | null
          observacoes?: string | null
          prazo_limite?: string | null
          assigned_to?: string | null
          created_at?: string
          produto_catalogo_id?: number | null
          solicitante_id?: string | null
          categoria?: string | null
          valor_unitario_comprado?: number | null
          marca_comprada?: string | null
          prazo_estimado_chegada?: string | null
          e_notificacao?: boolean | null
          arquivo_notificacao?: string | null
          demanda_judicial?: boolean | null
          arquivo_demanda_judicial?: string | null
          data_notificacao?: string | null
          justificativa_exclusao?: string | null
          excluido_por_nome?: string | null
          excluido_em?: string | null
          empenho_excluido_por?: string | null
          empenho_excluido_motivo?: string | null
          empenho_excluido_em?: string | null
          empenho_numero_legado?: string | null
          item_descricao_legado?: string | null
          nota_id?: number | null
        }
        Update: {
          id?: number
          item_id?: number | null
          item_ata_id?: number | null
          quantidade_solicitada?: number
          status?: string
          usuario_solicitante?: string | null
          observacoes?: string | null
          prazo_limite?: string | null
          assigned_to?: string | null
          created_at?: string
          produto_catalogo_id?: number | null
          solicitante_id?: string | null
          categoria?: string | null
          valor_unitario_comprado?: number | null
          marca_comprada?: string | null
          prazo_estimado_chegada?: string | null
          e_notificacao?: boolean | null
          arquivo_notificacao?: string | null
          demanda_judicial?: boolean | null
          arquivo_demanda_judicial?: string | null
          data_notificacao?: string | null
          justificativa_exclusao?: string | null
          excluido_por_nome?: string | null
          excluido_em?: string | null
          empenho_excluido_por?: string | null
          empenho_excluido_motivo?: string | null
          empenho_excluido_em?: string | null
          empenho_numero_legado?: string | null
          item_descricao_legado?: string | null
          nota_id?: number | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          action: string
          table_name: string
          record_id: string | null
          user_email: string | null
          details: Json | null
          timestamp: string
        }
        Insert: {
          id?: string
          action: string
          table_name: string
          record_id?: string | null
          user_email?: string | null
          details?: Json | null
          timestamp?: string
        }
        Update: {
          id?: string
          action?: string
          table_name?: string
          record_id?: string | null
          user_email?: string | null
          details?: Json | null
          timestamp?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          nome: string | null
          sobrenome: string | null
          cpf: string | null
          role: string | null
          setor: string | null
          nivel: string | null
          cargo_id: number | null
          name_change_count: number | null
          last_password_change: string | null
          created_at: string | null
          status_aprovacao: string | null
          tarefa_padrao: string | null
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          nome?: string | null
          sobrenome?: string | null
          cpf?: string | null
          role?: string | null
          setor?: string | null
          nivel?: string | null
          cargo_id?: number | null
          name_change_count?: number | null
          last_password_change?: string | null
          created_at?: string | null
          status_aprovacao?: string | null
          tarefa_padrao?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          display_name?: string | null
          nome?: string | null
          sobrenome?: string | null
          cpf?: string | null
          role?: string | null
          setor?: string | null
          nivel?: string | null
          cargo_id?: number | null
          name_change_count?: number | null
          last_password_change?: string | null
          created_at?: string | null
          status_aprovacao?: string | null
          tarefa_padrao?: string | null
        }
        Relationships: []
      }
      cargos_permissoes: {
        Row: {
          id: number
          nome: string
          permissoes: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          nome: string
          permissoes?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          nome?: string
          permissoes?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      entidades: {
        Row: {
          id: number
          nome: string
          estado: string | null
          municipio: string | null
          regiao: string | null
          owner_id: string | null
          cnpj: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          nome: string
          estado?: string | null
          municipio?: string | null
          regiao?: string | null
          owner_id?: string | null
          cnpj?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          nome?: string
          estado?: string | null
          municipio?: string | null
          regiao?: string | null
          owner_id?: string | null
          cnpj?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      contratos: {
        Row: {
          id: string
          numero_contrato: string
          ata_id: string | null
          entidade_id: number | null
          objeto_contrato: string | null
          valor_total: number | null
          data_assinatura: string | null
          data_validade: string | null
          arquivo_caminho: string | null
          owner_id: string | null
          assigned_to: string | null
          created_at: string
        }
        Insert: {
          id?: string
          numero_contrato: string
          ata_id?: string | null
          entidade_id?: number | null
          objeto_contrato?: string | null
          valor_total?: number | null
          data_assinatura?: string | null
          data_validade?: string | null
          arquivo_caminho?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          numero_contrato?: string
          ata_id?: string | null
          entidade_id?: number | null
          objeto_contrato?: string | null
          valor_total?: number | null
          data_assinatura?: string | null
          data_validade?: string | null
          arquivo_caminho?: string | null
          owner_id?: string | null
          assigned_to?: string | null
          created_at?: string
        }
        Relationships: []
      }
      itens_contrato: {
        Row: {
          id: string
          contrato_id: string
          item_ata_id: number | null
          numero_item: string | null
          descricao: string
          unidade: string | null
          quantidade_contratada: number
          valor_unitario: number
          marca: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contrato_id: string
          item_ata_id?: number | null
          numero_item?: string | null
          descricao: string
          unidade?: string | null
          quantidade_contratada: number
          valor_unitario: number
          marca?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contrato_id?: string
          item_ata_id?: number | null
          numero_item?: string | null
          descricao?: string
          unidade?: string | null
          quantidade_contratada?: number
          valor_unitario?: number
          marca?: string | null
          created_at?: string
        }
        Relationships: []
      }
      aditivos_ata: {
        Row: {
          id: string
          ata_id: string | null
          contrato_id: string | null
          numero_aditivo: string
          tipo: string
          nova_data_validade: string | null
          justificativa: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          ata_id?: string | null
          contrato_id?: string | null
          numero_aditivo: string
          tipo: string
          nova_data_validade?: string | null
          justificativa?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          ata_id?: string | null
          contrato_id?: string | null
          numero_aditivo?: string
          tipo?: string
          nova_data_validade?: string | null
          justificativa?: string | null
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      aditivos_itens_ata: {
        Row: {
          id: string
          aditivo_id: string
          item_ata_id: number | null
          item_contrato_id: string | null
          quantidade_adicionada: number
          created_at: string
        }
        Insert: {
          id?: string
          aditivo_id: string
          item_ata_id?: number | null
          item_contrato_id?: string | null
          quantidade_adicionada: number
          created_at?: string
        }
        Update: {
          id?: string
          aditivo_id?: string
          item_ata_id?: number | null
          item_contrato_id?: string | null
          quantidade_adicionada?: number
          created_at?: string
        }
        Relationships: []
      }
      catalogo_produtos: {
        Row: {
          id: number
          codigo_interno: string
          descricao_completa: string
          descricao_resumida: string | null
          unidade_venda: string | null
          unidade_compra: string | null
          marca: string | null
          fabricante: string | null
          grupo: string | null
          classe: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          codigo_interno: string
          descricao_completa: string
          descricao_resumida?: string | null
          unidade_venda?: string | null
          unidade_compra?: string | null
          marca?: string | null
          fabricante?: string | null
          grupo?: string | null
          classe?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          codigo_interno?: string
          descricao_completa?: string
          descricao_resumida?: string | null
          unidade_venda?: string | null
          unidade_compra?: string | null
          marca?: string | null
          fabricante?: string | null
          grupo?: string | null
          classe?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cotacoes_privado: {
        Row: {
          id: string
          codigo_interno: string | null
          data_lancamento: string
          descricao: string
          marca: string | null
          situacao: string
          quantidade: number
          unidade: string
          comprou_status: string | null
          data_compra: string | null
          solicitante: string
          solicitante_id: string | null
          owner_id: string | null
          urgente: boolean
          anexo_url: string | null
          anexo_compras_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          codigo_interno?: string | null
          data_lancamento?: string
          descricao: string
          marca?: string | null
          situacao?: string
          quantidade: number
          unidade: string
          comprou_status?: string | null
          data_compra?: string | null
          solicitante: string
          solicitante_id?: string | null
          owner_id?: string | null
          urgente?: boolean
          anexo_url?: string | null
          anexo_compras_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          codigo_interno?: string | null
          data_lancamento?: string
          descricao?: string
          marca?: string | null
          situacao?: string
          quantidade?: number
          unidade?: string
          comprou_status?: string | null
          data_compra?: string | null
          solicitante?: string
          solicitante_id?: string | null
          owner_id?: string | null
          urgente?: boolean
          anexo_url?: string | null
          anexo_compras_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      chamados_nexus: {
        Row: {
          id: number
          created_at: string
          solicitante_id: string | null
          usuario_nome: string
          usuario_email: string | null
          usuario_setor: string | null
          tipo: string
          modulo: string
          prioridade: string
          titulo: string
          descricao: string
          anexo_caminho: string | null
          status: string
          resposta_dev: string | null
          data_resposta: string | null
          data_conclusao: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          solicitante_id?: string | null
          usuario_nome: string
          usuario_email?: string | null
          usuario_setor?: string | null
          tipo: string
          modulo: string
          prioridade?: string
          titulo: string
          descricao: string
          anexo_caminho?: string | null
          status?: string
          resposta_dev?: string | null
          data_resposta?: string | null
          data_conclusao?: string | null
        }
        Update: {
          id?: number
          created_at?: string
          solicitante_id?: string | null
          usuario_nome?: string
          usuario_email?: string | null
          usuario_setor?: string | null
          tipo?: string
          modulo?: string
          prioridade?: string
          titulo?: string
          descricao?: string
          anexo_caminho?: string | null
          status?: string
          resposta_dev?: string | null
          data_resposta?: string | null
          data_conclusao?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      incrementar_abatimento_ata: {
        Args: {
          target_item_ata_id: number
          qtd: number
        }
        Returns: undefined
      }
      admin_update_user_name: {
        Args: {
          target_user_id: string
          new_display_name: string
        }
        Returns: { success: boolean; message: string }
      }
      admin_delete_user_account: {
        Args: {
          target_user_id: string
        }
        Returns: { success: boolean; message: string }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
