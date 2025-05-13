
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateApiKey } from './api-key'
import { createClient } from './supabase'

interface WorkspaceState {
  apiKey: string | null
  isLoading: boolean
  error: string | null
  isConnected: boolean
  generateNewApiKey: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  fetchApiKey: () => Promise<void>
  setConnectionStatus: (status: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      apiKey: null,
      isLoading: false,
      error: null,
      isConnected: false,
      generateNewApiKey: async () => {
        try {
          set({ isLoading: true, error: null })
          const supabase = createClient()
          
          // Get the current user
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          if (authError || !user) {
            throw new Error('Not authenticated')
          }

          // Get the user's workspace
          const { data: workspace, error: workspaceError } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .single()

          if (workspaceError || !workspace) {
            throw new Error('No workspace found')
          }

          const newKey = generateApiKey()
          
          // First, delete any existing API keys for this user
          const { error: deleteError } = await supabase
            .from('api_keys')
            .delete()
            .eq('user_id', user.id)

          if (deleteError) throw deleteError

          // Then insert the new key
          const { error: insertError } = await supabase
            .from('api_keys')
            .insert({ 
              user_id: user.id,
              workspace_id: workspace.id,
              key: newKey,
              created_at: new Date().toISOString(),
              last_used: new Date().toISOString()
            })

          if (insertError) throw insertError
          
          set({ apiKey: newKey })
        } catch (error) {
          console.error('Error generating API key:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to generate API key' })
        } finally {
          set({ isLoading: false })
        }
      },
      setApiKey: async (key: string) => {
        try {
          set({ isLoading: true, error: null })
          const supabase = createClient()
          
          // Get the current user
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          if (authError || !user) {
            throw new Error('Not authenticated')
          }

          // Get the user's workspace
          const { data: workspace, error: workspaceError } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .single()

          if (workspaceError || !workspace) {
            throw new Error('No workspace found')
          }

          // First, delete any existing API keys for this user
          const { error: deleteError } = await supabase
            .from('api_keys')
            .delete()
            .eq('user_id', user.id)

          if (deleteError) throw deleteError

          // Then insert the new key
          const { error: insertError } = await supabase
            .from('api_keys')
            .insert({ 
              user_id: user.id,
              workspace_id: workspace.id,
              key,
              created_at: new Date().toISOString(),
              last_used: new Date().toISOString()
            })

          if (insertError) throw insertError
          
          set({ apiKey: key })
        } catch (error) {
          console.error('Error setting API key:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to set API key' })
        } finally {
          set({ isLoading: false })
        }
      },
      fetchApiKey: async () => {
        try {
          set({ isLoading: true, error: null })
          const supabase = createClient()
          
          // Get the current user
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          if (authError || !user) {
            throw new Error('Not authenticated')
          }

          const { data, error } = await supabase
            .from('api_keys')
            .select('key')
            .eq('user_id', user.id)
            .single()

          if (error) {
            if (error.code === 'PGRST116') {
              // No API key found, that's okay
              set({ apiKey: null })
              return
            }
            throw error
          }
          
          if (data) {
            set({ apiKey: data.key })
          }
        } catch (error) {
          console.error('Error fetching API key:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to fetch API key' })
        } finally {
          set({ isLoading: false })
        }
      },
      setConnectionStatus: (status: boolean) => {
        set({ isConnected: status })
      }
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({ apiKey: state.apiKey, isConnected: state.isConnected }), // Also persist connection status
    }
  )
) 