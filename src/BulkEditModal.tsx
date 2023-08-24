import * as _ from 'lodash'
import {
  DropdownComponent,
  Modal,
  Notice,
  Setting,
  TFile,
  TFolder,
  TextComponent,
  stringifyYaml,
} from 'obsidian'
import { DataArray, DataviewApi, getAPI } from 'obsidian-dataview'
import invariant from 'tiny-invariant'
import toStyle from 'to-style'
import {
  processCustomJS,
  processFindAndReplace,
  processMoveFiles,
  processProperties,
  processTags,
} from './edits'

export default class BulkEditModal extends Modal {
  queryString: string
  dv: DataviewApi
  files: DataArray<Record<string, any>>
  edit: Edit | null
  displayOptions: HTMLDivElement
  displayEdits: HTMLDivElement
  displayPreview: HTMLDivElement

  constructor(filter: string) {
    super(app)
    const dv = getAPI()
    invariant(dv)
    this.dv = dv
    this.queryString = filter
    this.files = this.dv.pages(`${this.queryString}`)
    this.edit = null
  }

  renderDisplayEdits() {
    this.displayEdits.empty()
    if (!this.edit) {
      return
    }
    const display = (
      <ul>
        {this.edit.type === 'tag' ? (
          _.sortBy(_.entries(this.edit.edit), 0).map(([property, value]) => (
            <li>
              {property}: {value.action.toUpperCase()}
            </li>
          ))
        ) : this.edit.type === 'property' ? (
          _.sortBy(_.entries(this.edit.edit), 0).map(([property, value]) => (
            <li>
              {property}: {value.action.toUpperCase()}{' '}
              {value.action === 'rename' ? `To ${value.to}` : ''}
            </li>
          ))
        ) : (
          <></>
        )}
      </ul>
    )
    this.displayEdits.appendChild(display)
  }

  renderDisplayOptions() {
    this.renderDisplayEdits()
    this.displayOptions.empty()
    if (!this.edit) return
    switch (this.edit.type) {
      case 'customJS':
        this.createCustomJSSettings()
        break
      case 'findAndReplace':
        this.createFindReplaceSettings()
        break
      case 'moveFiles':
        this.createMoveSettings()
        break
      case 'property':
        this.createEditPropertySettings()
        break
      case 'tag':
        this.createEditTagSettings()
        break
    }
  }

  createEditPropertySettings() {
    invariant(this.edit?.type === 'property')
    const editProperty = new Setting(this.displayOptions)
    let renameText: TextComponent
    let selectPropertyDropdown: DropdownComponent
    let editPropertyDropdown: DropdownComponent

    editProperty
      .setName(`Edit Property`)
      .addDropdown((dropdown) => {
        const files = this.files.array()
        const options = _.fromPairs(
          _.uniq(files.map((x) => _.keys(_.omit(x, 'file'))).flat()).map(
            (x: string) =>
              [x.toLowerCase(), x.toLowerCase()] as [string, string]
          )
        )
        dropdown.addOptions(options)
        dropdown.onChange((value) => {
          invariant(this.edit?.type === 'property')
          const currentPropertyEdit = this.edit.edit[value]
          if (currentPropertyEdit) {
            if (currentPropertyEdit.action === 'rename') {
              renameText?.setValue(currentPropertyEdit.to)
              this.renderDisplayEdits()
            }
          }
        })
        selectPropertyDropdown = dropdown
      })
      .addDropdown((dropdown) => {
        const options = {
          cancel: 'Cancel',
          delete: 'Delete',
          rename: 'Rename',
          inline: 'Turn to inline',
          frontmatter: 'Turn to frontmatter',
          'nested-tags': 'Add nested tags',
        }

        dropdown.addOptions(options)
        editPropertyDropdown = dropdown
      })

    editProperty.addText((text) => {
      renameText = text
    })

    editProperty.addButton((button) =>
      button.setButtonText('Enter').onClick(() => {
        invariant(this.edit?.type === 'property')
        const value = editPropertyDropdown.getValue()
        const values: Record<string, PropertyAction> = {
          delete: {
            action: 'delete',
          },
          rename: {
            action: 'rename',
            to: renameText.getValue(),
          },
          inline: { action: 'inline' },
          frontmatter: { action: 'frontmatter' },
          'nested-tags': { action: 'nested-tags' },
        }
        const currentProperty =
          values[value].action === 'rename'
            ? renameText.getValue()
            : selectPropertyDropdown.getValue()
        if (value === 'cancel') delete this.edit.edit[currentProperty]
        else this.edit.edit[currentProperty] = values[value]
        this.renderDisplayEdits()
      })
    )
  }

  createEditTagSettings() {
    invariant(this.edit?.type === 'tag')
    const editTag = new Setting(this.displayOptions)
    let selectTagDropdown: DropdownComponent
    let editTagDropdown: DropdownComponent
    let addTagText: TextComponent

    editTag
      .setName(`Edit Tag`)
      .addDropdown((dropdown) => {
        const options = _.fromPairs(
          _.sortBy(
            _.uniq(this.files['file']['tags']).map((x: string) => {
              const formatted = x.toLowerCase().slice(1)
              return [formatted, formatted] as [string, string]
            }),
            '1'
          )
        )
        dropdown.addOptions(options)
        selectTagDropdown = dropdown
      })
      .addDropdown((dropdown) => {
        const options: Record<TagAction['action'] | 'cancel', string> = {
          delete: 'Delete',
          add: 'Add',
          cancel: 'Cancel',
        }
        dropdown.addOptions(options)
        editTagDropdown = dropdown
      })

    editTag.addText((text) => {
      addTagText = text
    })

    editTag.addButton((button) =>
      button.setButtonText('Enter').onClick(() => {
        invariant(this.edit?.type === 'tag')
        const value = editTagDropdown.getValue()
        const values: Record<TagAction['action'], TagAction> = {
          delete: { action: 'delete' },
          add: { action: 'add' },
        }
        const currentProperty =
          values[value].action === 'add'
            ? addTagText.getValue()
            : selectTagDropdown.getValue()
        if (value === 'cancel') delete this.edit.edit[currentProperty]
        else this.edit.edit[currentProperty] = values[value]
        this.renderDisplayEdits()
      })
    )
  }

  createFindReplaceSettings() {
    new Setting(this.displayOptions)
      .setName('Find & Replace')
      .setDesc(
        'Use RegEx to find & replace over all files. Learn more about RegEx at https://regexr.com.'
      )
      .addText((text) => {
        text.setPlaceholder('Find').onChange((value) => {
          invariant(this.edit?.type === 'findAndReplace')
          this.edit.edit.find = value
        })
      })
      .addText((text) => {
        invariant(this.edit?.type === 'findAndReplace')
        text.setPlaceholder('Flags').onChange((value) => {
          invariant(this.edit?.type === 'findAndReplace')
          this.edit.edit.flags = value
        })
      })
      .addText((text) => {
        invariant(this.edit?.type === 'findAndReplace')
        text.setPlaceholder('Replace').onChange((value) => {
          invariant(this.edit?.type === 'findAndReplace')
          this.edit.edit.replace = value
        })
      })
  }

  createMoveSettings() {
    new Setting(this.displayOptions)
      .setName('Move Files')
      .setDesc('Move files to the target folder')
      .addText((text) => {
        text.onChange((value) => {
          invariant(this.edit?.type === 'moveFiles')
          this.edit.edit = value
        })
      })
  }

  createCustomJSSettings() {
    new Setting(this.displayOptions)
      .setName('Custom JavaScript')
      .setDesc('Run a custom bulk edit function.')
      .addTextArea((component) => {
        component
          .onChange((value) => {
            invariant(this.edit?.type === 'customJS')
            this.edit.edit = value
          })
          .setPlaceholder(
            'The function is passed an object, {text: string, metadata: object}, mutates the objects directly, and returns nothing. Write the body of the function only.\nexample:\ntext = text.replace("sample", "replacement")\nmetadata["new-property"] = "new value")'
          )
        component.inputEl.style.setProperty('width', '100%')
      })
  }

  onOpen() {
    let { contentEl } = this

    let queryStringInput: TextComponent
    let fileList = (
      <div style='width:100%;height:100px;overflow-y:auto;'></div>
    ) as HTMLDivElement
    fileList.appendChild(
      <ul>
        {this.files['file']['path'].map((path: string) => (
          <li>{path}</li>
        ))}
      </ul>
    )

    new Setting(contentEl)
      .setName('Dataview Query string')
      .setDesc('Filter with a query string from the Dataview JavaScript API.')
      .addText((text) => {
        text.setValue(this.queryString)
        queryStringInput = text
      })
      .addButton((button) =>
        button.setButtonText('search').onClick(() => {
          const search = queryStringInput.getValue()
          try {
            this.files = this.dv.pages(`${search}`)
            fileList.empty()
            fileList.appendChild(
              <ul style='width:100%;height:100px;overflow-y:auto;'>
                {this.files['file']['path'].map((path: string) => (
                  <li>{path}</li>
                ))}
              </ul>
            )
            this.edit = null
            this.renderDisplayOptions()
          } catch (err) {
            new Notice('ERROR:', err.message)
          }
        })
      )
    contentEl.appendChild(fileList)

    let editOptions = contentEl.appendChild(<div></div>)
    new Setting(editOptions).setName('Action').addDropdown((dropdown) => {
      const options: { [K in Edit['type']]: string } = {
        customJS: 'Custom JavaScript',
        findAndReplace: 'Regex Find & Replace',
        moveFiles: 'Move Files',
        property: 'Edit Dataview Properties',
        tag: 'Edit Tags',
      }
      dropdown.addOptions(options)
      dropdown.onChange((value: Edit['type']) => {
        const defaultEdits: {
          [K in Edit['type']]: (Edit & { type: K })['edit']
        } = {
          customJS: '',
          findAndReplace: { find: '', replace: '', flags: '' },
          moveFiles: '',
          property: {},
          tag: {},
        }
        this.edit = { type: value, edit: defaultEdits[value] } as Edit
        this.renderDisplayOptions()
      })
    })

    this.displayOptions = contentEl.appendChild(<div></div>)
    this.displayEdits = contentEl.appendChild(<div></div>)
    const go = contentEl.appendChild(<div></div>)
    new Setting(go)
      .addButton((button) =>
        button.setButtonText('Preview').onClick(() => this.process(true))
      )
      .addButton((button) =>
        button.setButtonText('Go').onClick(async () => {
          const fileString = `${this.files.length} file${
            this.files.length !== 1 ? 's' : ''
          }`
          if (!confirm(`Process ${fileString}?`)) return
          await this.process(false)
          new Notice(`Bulk Edit: processed ${fileString}`)
        })
      )
    contentEl.appendChild(go)
    this.displayPreview = contentEl.appendChild(<div></div>)
  }

  renderPreview(previews: Preview[]) {
    this.displayPreview.empty()
    const child = (
      <div style={{ fontFamily: 'var(--font-text)' }}>
        {previews.map(({ metadata, title, text }) => (
          <div>
            <h2 style={toStyle.string({ fontWeight: 'bold' })}>{title}</h2>
            <div
              style={toStyle.string({
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              })}
            >
              {stringifyYaml(metadata)}
            </div>
            <div
              style={toStyle.string({
                whiteSpace: 'pre-wrap',
                borderBottom: '16px',
              })}
            >
              {text.replace(/^---\n(.*\n)*---\n/, '')}
            </div>
          </div>
        ))}
      </div>
    )
    this.displayPreview.appendChild(child as any)
  }

  async process(preview = false) {
    if (!this.edit) return

    const previews: Promise<PreviewFile | []>[] = this.files
      .map((file) => {
        invariant(this.edit)
        const thisFile = app.vault.getAbstractFileByPath(
          file.file.path
        ) as TFile
        switch (this.edit.type) {
          case 'customJS':
            return processCustomJS(thisFile, this.edit, preview)
          case 'moveFiles':
            return processMoveFiles(thisFile, this.edit, preview)
          case 'findAndReplace':
            return processFindAndReplace(thisFile, this.edit, preview)
          case 'property':
            return processProperties(thisFile, this.edit, preview, file)
          case 'tag':
            return processTags(thisFile, this.edit, preview)
          default:
            throw new Error('edit type failed')
        }
      })
      .array()

    const resolvedPreviews = await Promise.all(previews)
    this.renderPreview(resolvedPreviews.flat())
  }
}
