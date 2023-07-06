type PropertyAction =
  | {
      action: 'delete' | 'inline' | 'frontmatter' | 'nested-tags'
    }
  | { action: 'rename'; to: string }
type TagAction = { action: 'delete' } | { action: 'add' }
type Preview = {
  title: string
  metadata: Record<string, string>
  text: string
}

type Edit =
  | { type: 'property'; edit: Record<string, PropertyAction> }
  | {
      type: 'tag'
      edit: Record<string, TagAction>
    }
  | {
      type: 'customJS'
      edit: string
    }
  | { type: 'moveFiles'; edit: string }
  | {
      type: 'findAndReplace'
      edit: { find: string; replace: string; flags: string }
    }
type EditedFile = { text: string; metadata: Record<string, any> }
type PreviewFile = EditedFile & { title: string }
