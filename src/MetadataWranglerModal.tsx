import $ from 'jquery'
import * as _ from 'lodash'
import {
  DropdownComponent,
  Modal,
  Notice,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  TextComponent,
  setIcon,
} from 'obsidian'
import {
  DataArray,
  DataviewApi,
  Link,
  Literal,
  getAPI,
} from 'obsidian-dataview'
import invariant from 'tiny-invariant'
import { stringifyYaml } from 'obsidian'
import toStyle from 'to-style'
import { wrap } from 'module'

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

export default class MetadataWranglerModal extends Modal {
  file: TAbstractFile
  dv: DataviewApi
  files: DataArray<Record<string, any>>
  options: {
    convertToLowercase: boolean
    syncLinksInMetadata: boolean
    find: string
    replace: string
    flags: string
  }
  edits: {
    property: Record<string, PropertyAction>
    tag: Record<string, TagAction>
    customJS: string
    convertIndex: Link[]
    moveFiles: string
  }
  previewElement: HTMLDivElement
  displayProperties?: HTMLDivElement
  displayTags?: HTMLDivElement
  displayFileNames?: HTMLDivElement

  constructor(file: TAbstractFile) {
    super(app)
    this.file = file
    const dv = getAPI()
    invariant(dv)
    this.dv = dv
    this.files = this.dv.pages(`"${this.file.path}"`)

    this.options = {
      convertToLowercase: false,
      syncLinksInMetadata: false,
      find: '',
      replace: '',
      flags: '',
    }
    this.edits = {
      property: {},
      tag: {},
      customJS: '',
      convertIndex: [],
      moveFiles: '',
    }
  }

  updatePropertyEdits(type: 'tag' | 'property') {
    const displayProperty =
      type === 'tag' ? this.displayTags : this.displayProperties
    invariant(displayProperty)
    displayProperty.empty()
    const display = (
      <ul>
        {_.sortBy(_.entries(this.edits[type]), 0).map(([property, value]) => (
          <li>
            {property}: {value.action.toUpperCase()}{' '}
            {value.action === 'rename' ? ` to ${value.to}` : ''}
          </li>
        ))}
      </ul>
    )
    displayProperty.appendChild(display)
  }

  private deleteIcon() {
    const logo = (<div></div>) as HTMLDivElement
    setIcon(logo, 'delete')
    return logo
  }

  updateLinkEdits() {
    invariant(this.displayFileNames)
    const display: HTMLUListElement = (
      <ul>
        {_.sortBy(this.edits.convertIndex, 'path').map((link) => {
          return (
            <li>
              {link.fileName()}
              <button
                onclick={(ev) => {
                  _.pullAllBy(this.edits.convertIndex, [link], 'path')

                  this.updateLinkEdits()
                }}
              >
                {this.deleteIcon()}
              </button>
            </li>
          )
        })}
      </ul>
    )
    this.displayFileNames.empty()
    this.displayFileNames.appendChild(display)
  }

  createEditPropertySettings = (contentEl: HTMLElement) => {
    const type = 'property'
    const editProperty = new Setting(contentEl)
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
          const currentPropertyEdit = this.edits[type][value]
          if (currentPropertyEdit) {
            if (currentPropertyEdit.action === 'rename') {
              renameText?.setValue(currentPropertyEdit.to)
              this.updatePropertyEdits(type)
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
        if (value === 'cancel') delete this.edits.property[currentProperty]
        else this.edits.property[currentProperty] = values[value]
        this.updatePropertyEdits(type)
      })
    )

    this.displayProperties = contentEl.appendChild(
      document.createElement('div')
    )
  }

  createEditTagSettings = (contentEl: HTMLElement) => {
    const type = 'tag'
    const editTag = new Setting(contentEl)
    let selectTagDropdown: DropdownComponent
    let editTagDropdown: DropdownComponent
    let addTagText: TextComponent

    editTag
      .setName(`Edit Tag`)
      .addDropdown((dropdown) => {
        const options = _.fromPairs(
          _.uniq(this.files['file']['tags']).map((x: string) => {
            const formatted = x.toLowerCase().slice(1)
            return [formatted, formatted] as [string, string]
          })
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
        const value = editTagDropdown.getValue()
        const values: Record<TagAction['action'], TagAction> = {
          delete: { action: 'delete' },
          add: { action: 'add' },
        }
        const currentProperty =
          values[value].action === 'add'
            ? addTagText.getValue()
            : selectTagDropdown.getValue()
        if (value === 'cancel') delete this.edits.tag[currentProperty]
        else this.edits.tag[currentProperty] = values[value]
        this.updatePropertyEdits(type)
      })
    )

    this.displayTags = contentEl.appendChild(document.createElement('div'))
  }

  createOtherSettings(contentEl: HTMLElement) {
    new Setting(contentEl)
      .setName('Convert properties to lowercase')
      .addToggle((toggle) =>
        toggle.onChange((value) => (this.options.convertToLowercase = value))
      )

    new Setting(contentEl)
      .setName('Find & Replace')
      .setDesc(
        'Use RegEx to find & replace over all files. Learn more about RegEx at https://regexr.com.'
      )
      .addText((text) => {
        text
          .setPlaceholder('Find')
          .onChange((value) => (this.options.find = value))
      })
      .addText((text) => {
        text
          .setPlaceholder('Flags')
          .onChange((value) => (this.options.flags = value))
      })
      .addText((text) => {
        text
          .setPlaceholder('Replace')
          .onChange((value) => (this.options.replace = value))
      })

    const folderReorganizing = new Setting(contentEl)
      .setName('Convert links to nested folders')
      .setDesc(
        'Parse links from or to this file and move them into the current folder.'
      )

    const toggleLinks = (type: 'inlinks' | 'outlinks', value: boolean) => {
      if (value)
        this.edits.convertIndex.push(...this.files['file'][type].array())
      else if (!value)
        _.pullAllBy(
          this.edits.convertIndex,
          ...this.files['file'][type].array(),
          'path'
        )
      this.edits.convertIndex = _.uniqBy(this.edits.convertIndex, 'path')
      this.updateLinkEdits()
    }

    folderReorganizing.controlEl.appendChild(<div>Outgoing</div>)
    folderReorganizing.addToggle((button) =>
      button.onChange((value) => {
        toggleLinks('outlinks', value)
      })
    )
    folderReorganizing.controlEl.appendChild(<div>Incoming</div>)
    folderReorganizing.addToggle((button) =>
      button.onChange((value) => toggleLinks('inlinks', value))
    )

    this.displayFileNames = (
      <div
        style={toStyle.string({
          maxHeight: '100px',
          overflow: 'auto',
        })}
      ></div>
    )
    contentEl.appendChild(this.displayFileNames as HTMLDivElement)

    new Setting(contentEl)
      .setName('Move Files')
      .setDesc('Move files to the target folder')
      .addText((text) => {
        text.onChange((value) => (this.edits.moveFiles = value))
      })

    new Setting(contentEl)
      .setName('Custom JavaScript')
      .setDesc('Run a custom bulk edit function.')
      .addTextArea((component) => {
        component
          .onChange((value) => (this.edits.customJS = value))
          .setPlaceholder(
            'The function is passed an object, {text: string, metadata: object}, mutates the objects directly, and returns nothing. Write the body of the function only.\nexample:\ntext = text.replace("sample", "replacement")\nmetadata["new-property"] = "new value")'
          )
        component.inputEl.style.setProperty('width', '100%')
      })

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText('Preview').onClick(() => {
          this.process(true)
        })
      )
      .addButton((button) =>
        button.setButtonText('Go').onClick(() => {
          confirm(`Edit ${this.files.length} files?`) && this.process()
        })
      )

    this.previewElement = document.createElement('div')
    this.previewElement.style.setProperty('height', '200px')
    this.previewElement.style.setProperty('overflow-y', 'auto')
    this.previewElement.style.setProperty('overflow-x', 'hidden')
    this.previewElement.style.setProperty('width', '100%')
    contentEl.appendChild(this.previewElement)
  }

  reloadSettings(contentEl: HTMLElement) {
    contentEl.empty()
    this.createEditPropertySettings(contentEl)
    this.createEditTagSettings(contentEl)
    this.createOtherSettings(contentEl)
  }

  onOpen() {
    let { contentEl } = this

    let searchText: TextComponent
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
    let settingsContainer = <div></div>
    new Setting(contentEl)
      .setName('Dataview Query string')
      .setDesc('Filter with a query string from the Dataview JavaScript API.')
      .addText((text) => {
        searchText = text
      })
      .addButton((button) =>
        button.setButtonText('search').onClick(() => {
          const search = searchText.getValue()
          try {
            const path =
              this.file instanceof TFile
                ? this.file.parent?.path ?? ''
                : this.file instanceof TFolder
                ? this.file.path
                : ''

            const files = this.dv.pages(`"${path}" and (${search})`)
            this.files = files
            fileList.empty()
            fileList.appendChild(
              <ul style='width:100%;height:100px;overflow-y:auto;'>
                {this.files['file']['path'].map((path: string) => (
                  <li>{path}</li>
                ))}
              </ul>
            )
            this.reloadSettings(settingsContainer)
          } catch (err) {
            new Notice('ERROR:', err.message)
          }
        })
      )
    contentEl.appendChild(fileList)
    contentEl.appendChild(settingsContainer)
    this.reloadSettings(settingsContainer)
  }

  renderPreview(previews: Preview[]) {
    this.previewElement.empty()
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
    this.previewElement.appendChild(child as any)
  }

  private findInlineFields = (property: string) =>
    new RegExp(`(^|\\[|\\()${property}:: .*?(\\]|\\)|$)\\n?`, 'gim')

  processFrontMatter(
    file: Record<string, Literal>,
    text: string,
    metadata: Record<string, any>
  ) {
    const propertyEdits = _.entries(this.edits.property)
    const tagEdits = _.entries(this.edits.tag)

    for (let [property, value] of propertyEdits) {
      switch (value.action) {
        case 'rename':
          if (!metadata[property]) continue
          metadata[value.to] = metadata[property]
          delete metadata[property]
          break
        case 'delete':
          delete metadata[property]
          break
        case 'inline':
          if (metadata[property]) {
            const searchExp = this.findInlineFields(property)
            let inlineString = metadata[property]
              .toString()
              .replace(/,(?!\s)/g, ', ')
            if (property === 'tags')
              inlineString = inlineString
                .split(', ')
                .map((tag: string) => '#' + tag)
                .join(' ')

            text = text.replace(searchExp, '')
            text += `\n\n${property}:: ${inlineString}`
            delete metadata[property]
          }
          break
        case 'nested-tags':
          const currentProperty = file[property]?.toString()
          if (!currentProperty) continue
          const newTags = currentProperty
            .split(/(, *|\n)/)
            .filter((item) => /\w/.test(item))
            .map((item) => {
              return (
                property +
                '/' +
                item
                  .toLowerCase()
                  .replace(/^\s+/, '')
                  .replace(/\s+$/, '')
                  .replace(/\|.+\]\]$/, '')
                  .replace(/\s/g, '-')
                  .replace(/[^\w-]+/g, '')
              )
            })
          if (metadata.tags) metadata.tags.push(...newTags)
          else metadata.tags = newTags
          metadata.tags = _.uniq(metadata.tags)
          break
      }
    }

    for (let [tag, edit] of tagEdits) {
      switch (edit.action) {
        case 'delete':
          if (metadata.tags?.includes(tag)) {
            _.pull(metadata.tags, tag)
            if (metadata.tags.length === 0) delete metadata.tags
          }
          break
        case 'add':
          if (!metadata.tags) metadata.tags = [tag]
          else metadata.tags.push(tag)
          break
      }
    }

    if (this.options.convertToLowercase) {
      for (let property of _.keys(metadata)) {
        const newProperty = metadata[property]
        delete metadata[property]
        metadata[property.toLowerCase()] = newProperty
      }
    }

    return text
  }

  processText(file: any, text: string, metadata: Record<string, any>) {
    const propertyEdits = _.entries(this.edits.property)
    const tagEdits = _.entries(this.edits.tag)

    const frontMatter = text.match(/^---(.|\n)+?---/)?.[0] || ''
    let bodyText = text.replace(frontMatter, '')

    const allTags = file.file.tags.values
    for (let [tag, edit] of tagEdits) {
      switch (edit.action) {
        case 'delete':
          if (!allTags.includes('#' + tag)) continue
          bodyText = bodyText.replace(new RegExp(`#${tag}[\W$]?`, 'g'), '')
          break
      }
    }

    for (let [property, value] of propertyEdits) {
      const searchExp = this.findInlineFields(property)
      switch (value.action) {
        case 'frontmatter':
          const inlineProperty = bodyText.match(searchExp)?.[0]
          if (!inlineProperty) continue
          const propertyValue = inlineProperty
            .replace(/^\[\(/, '')
            .replace(/\]\)\n?$/, '')
            .split(':: ')[1]
          if (!propertyValue) continue
          metadata[property] = propertyValue
          bodyText = bodyText.replace(searchExp, '')
          break

        case 'delete':
          bodyText = bodyText.replace(searchExp, '')
          break

        case 'rename':
          const renameExp = new RegExp(`(\[|^)${property}::`, 'gm')
          bodyText = bodyText.replace(renameExp, value.to + '::')
      }
    }

    if (this.options.find) {
      if (new RegExp(this.options.find, this.options.flags).test(text)) {
        bodyText = bodyText.replace(
          new RegExp(this.options.find, this.options.flags),
          this.options.replace.replace(/\\n/g, '\n')
        )
      }
    }

    return frontMatter + bodyText
  }

  private stripFrontMatter(text: string) {
    return text.replace(/^---(.|\n)+?---\n*/, '')
  }

  private splitFrontMatter(text: string) {
    return [
      text.match(/^---(.|\n)+?---\n*/)?.[0] ?? '',
      this.stripFrontMatter(text) ?? '',
    ]
  }

  async moveFiles(
    file: Record<string, any>,
    preview: boolean,
    previews: Preview[]
  ) {
    if (this.edits.convertIndex.length > 0)
      this.edits.convertIndex.forEach((outlink: Link) => {
        outlink = outlink.toFile()
        const tFile = app.vault.getAbstractFileByPath(outlink.path)
        if (!(tFile instanceof TFile)) return
        const newFileName =
          (this.file.parent?.path ?? '') +
          '/' +
          outlink.fileName() +
          '.' +
          tFile.extension
        previews.push({
          title: outlink.path,
          text: `MOVED TO: ${newFileName}`,
          metadata: {},
        })
        if (!preview) this.app.fileManager.renameFile(tFile, newFileName)
      })
    if (this.edits.moveFiles) {
      const targetFolder = app.vault.getAbstractFileByPath(this.edits.moveFiles)
      if (!(targetFolder instanceof TFolder)) return
      const tFile = app.vault.getAbstractFileByPath(file.file.path)
      if (!(tFile instanceof TFile)) return
      const newFileName = (this.edits.moveFiles ?? '') + '/' + tFile.name
      previews.push({
        title: tFile.path,
        text: `MOVED TO: ${newFileName}`,
        metadata: {},
      })
      if (!preview) this.app.fileManager.renameFile(tFile, newFileName)
    }
  }

  async process(preview = false) {
    const previews: Preview[] = []

    for (let file of this.files) {
      const thisFile = app.vault.getAbstractFileByPath(file.file.path) as TFile

      let text = await app.vault.read(thisFile)
      const originalText = text
      let metadata: Record<string, any> = {}
      await app.fileManager.processFrontMatter(
        thisFile,
        (originalFrontmatter) => (metadata = originalFrontmatter)
      )
      const originalMetadata = _.cloneDeep(metadata)

      if (this.edits.customJS) {
        text = this.stripFrontMatter(text)
        const customFunction = eval(`({text, frontmatter}) => {
          ${this.edits.customJS}
          return text
        }`)
        text = customFunction({ text, metadata })
      }

      // need to rewrite text directly because it's a string
      text = this.processText(file, text, metadata)
      text = this.processFrontMatter(file, text, metadata)

      if (text !== originalText || !_.isEqual(metadata, originalMetadata)) {
        previews.push({
          title: thisFile.name.replace(/\.md/, ''),
          metadata,
          text,
        })
        if (!preview) {
          await app.vault.modify(thisFile, text)
          await app.fileManager.processFrontMatter(
            thisFile,
            (originalFrontmatter) => {
              for (let property of _.keys(metadata))
                originalFrontmatter[property] = metadata[property]
              for (let deletedKey of _.difference(
                _.keys(originalFrontmatter),
                _.keys(metadata)
              ))
                delete originalFrontmatter[deletedKey]
            }
          )
        }
      }

      this.moveFiles(file, preview, previews)
    }

    this.renderPreview(previews)
  }

  async indexToFolderStructure(file: TFile) {
    const index = this.dv.pages(file.path)['file']['links']
  }
}
