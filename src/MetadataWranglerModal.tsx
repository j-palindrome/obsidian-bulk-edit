import $ from 'jquery'
import * as _ from 'lodash'
import {
  DropdownComponent,
  Modal,
  Setting,
  TAbstractFile,
  TFile,
  TextComponent,
} from 'obsidian'
import { DataArray, DataviewApi, Literal, getAPI } from 'obsidian-dataview'
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
  frontmatter: Record<string, string>
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
  }
  previewElement: HTMLDivElement
  displayProperties?: HTMLDivElement
  displayTags?: HTMLDivElement

  constructor(file: TAbstractFile) {
    super(app)
    this.file = file
    const dv = getAPI()
    invariant(dv)
    this.dv = dv
    this.options = {
      convertToLowercase: false,
      syncLinksInMetadata: false,
      find: '',
      replace: '',
      flags: '',
    }
    this.edits = { property: {}, tag: {} }
    this.files = this.dv.pages(`"${this.file.path}"`)
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

  createEditSettings = () => {
    const { contentEl } = this
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
      text.onChange((value) => {
        invariant(selectPropertyDropdown)
        this.edits[type][selectPropertyDropdown.getValue()] = {
          action: 'rename',
          to: value,
        }
        renameText = text
        this.updatePropertyEdits(type)
      })
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
            to: '',
          },
          inline: { action: 'inline' },
          frontmatter: { action: 'frontmatter' },
          'nested-tags': { action: 'nested-tags' },
        }
        const currentProperty = selectPropertyDropdown.getValue()
        if (value === 'cancel') delete this.edits.property[currentProperty]
        else this.edits.property[currentProperty] = values[value]
        this.updatePropertyEdits(type)
      })
    )

    this.displayProperties = contentEl.appendChild(
      document.createElement('div')
    )
  }

  createEditTagSettings = () => {
    const { contentEl } = this
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

    let currentAddTagValue: string
    editTag.addText((text) => {
      text.onChange((value) => {
        invariant(selectTagDropdown)
        if (currentAddTagValue) delete this.edits.tag[currentAddTagValue]
        this.edits.tag[value] = { action: 'add' }
        this.updatePropertyEdits(type)
        currentAddTagValue = value
      })
      addTagText = text
    })

    editTag.addButton((button) =>
      button.setButtonText('Enter').onClick(() => {
        const value = editTagDropdown.getValue()
        const values: Record<TagAction['action'], TagAction> = {
          delete: { action: 'delete' },
          add: { action: 'add' },
        }
        const currentProperty = selectTagDropdown.getValue()
        if (value === 'cancel') {
          if (currentProperty) delete this.edits.tag[currentProperty]
          if (currentAddTagValue) delete this.edits.tag[currentAddTagValue]
        } else this.edits.tag[currentProperty] = values[value]
        this.updatePropertyEdits(type)
      })
    )

    this.displayTags = contentEl.appendChild(document.createElement('div'))
  }

  onOpen() {
    let { contentEl } = this

    const div = $(/*html*/ `
		<ul style='width:100%;height:100px;overflow-y:auto;'>
			${this.files['file']['path']
        .map((path: string) => /*html*/ `<li>${path}</li>`)
        .join('\n')}
		</ul>`)
    contentEl.appendChild(div[0])

    this.createEditSettings()
    this.createEditTagSettings()

    new Setting(contentEl)
      .setName('Convert properties to lowercase')
      .addToggle((toggle) =>
        toggle.onChange((value) => (this.options.convertToLowercase = value))
      )

    new Setting(contentEl).setName('Find').addText((text) => {
      text.onChange((value) => (this.options.find = value))
    })
    new Setting(contentEl).setName('Flags').addText((text) => {
      text.onChange((value) => (this.options.flags = value))
    })
    new Setting(contentEl).setName('Replace').addText((text) => {
      text.onChange((value) => (this.options.replace = value))
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

  renderPreview(previews: Preview[]) {
    this.previewElement.empty()
    const child = (
      <div style={{ fontFamily: 'var(--font-text)' }}>
        {previews.map(({ frontmatter, title, text }) => (
          <div>
            <h2 style={toStyle.string({ fontWeight: 'bold' })}>${title}</h2>
            <div
              style={toStyle.string({
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              })}
            >
              {stringifyYaml(frontmatter)}
            </div>
            <div
              style={toStyle.string({
                whiteSpace: 'pre-wrap',
                borderBottom: '16px',
              })}
            >
              {text}
            </div>
          </div>
        ))}
      </div>
    )
    this.previewElement.appendChild(child as any)
  }

  modifyFrontmatterObject(
    file: Record<string, Literal>,
    frontmatterObject: Record<string, any>,
    inlineProperties: Record<string, any>
  ) {
    const propertyEdits = _.entries(this.edits.property)
    const tagEdits = _.entries(this.edits.tag)

    for (let [property, value] of propertyEdits) {
      switch (value.action) {
        case 'rename':
          if (!frontmatterObject[property]) continue
          frontmatterObject[value.to] = frontmatterObject[property]
          delete frontmatterObject[property]
          break
        case 'delete':
          if (!frontmatterObject[property]) continue
          delete frontmatterObject[property]
          break
        case 'inline':
          if (!frontmatterObject[property]) continue
          inlineProperties[property] = frontmatterObject[property]
          delete frontmatterObject[property]
          break
        case 'nested-tags':
          const currentProperty = file[property]?.toString()
          if (!currentProperty) continue
          const newTags = currentProperty
            .split(/(, *|\n)/)
            .map(
              (item) =>
                property +
                '/' +
                item
                  .toLowerCase()
                  .replace(/^\s+/, '')
                  .replace(/\s+$/, '')
                  .replace(/\s/g, '-')
                  .replace(/\W+/, '')
            )
          if (frontmatterObject.tags) frontmatterObject.tags.push(...newTags)
          else frontmatterObject.tags = newTags
          frontmatterObject.tags = _.uniq(frontmatterObject.tags)
          break
      }
    }

    for (let [tag, edit] of tagEdits) {
      switch (edit.action) {
        case 'delete':
          if (frontmatterObject.tags?.includes(tag)) {
            _.pull(frontmatterObject.tags, tag)
            if (frontmatterObject.tags.length === 0)
              delete frontmatterObject.tags
          }
          break
        case 'add':
          if (!frontmatterObject.tags) frontmatterObject.tags = [tag]
          else frontmatterObject.tags.push(tag)
          break
      }
    }

    if (this.options.convertToLowercase) {
      for (let property of _.keys(frontmatterObject)) {
        frontmatterObject[property.toLowerCase()] = frontmatterObject[property]
        delete frontmatterObject[property]
      }
    }
  }

  async processText(
    file,
    thisFile: TFile,
    currentProperties: Record<string, string>,
    inlineProperties: Record<string, string>,
    frontMatterProperties: Record<string, string>
  ) {
    const propertyEdits = _.entries(this.edits.property)
    const tagEdits = _.entries(this.edits.tag)

    let text = await app.vault.read(thisFile)

    const frontMatter = text.match(/^---(.|\n)+?---/)?.[0] || ''
    let bodyText = text.replace(/^---(.|\n)+?---/, '')

    const allTags = file.file.tags.values
    for (let [tag, edit] of tagEdits) {
      switch (edit.action) {
        case 'delete':
          if (!allTags.includes('#' + tag)) continue
          bodyText = bodyText.replace(new RegExp(`#${tag}[\W$]?`, 'g'), '')
          break
      }
    }

    for (let [property, value] of _.entries(inlineProperties)) {
      const searchExp = new RegExp(
        `[^\\[\\(]${property}:: .*?[\\]\\)^]\\n?`,
        'gim'
      )
      bodyText = bodyText.replace(searchExp, '')
      bodyText += `\n${property}:: ${value}`
    }

    for (let [property, value] of propertyEdits) {
      const searchExp = new RegExp(
        `[^\\[\\(]${property}:: .*?[\\]\\)^]\\n?`,
        'gim'
      )
      switch (value.action) {
        case 'frontmatter':
          const inlineProperty = bodyText.match(searchExp)?.[0]
          if (!inlineProperty) continue
          const propertyValue = inlineProperty
            .replace(/^\[\(/, '')
            .replace(/\]\)\n?$/, '')
            .split(':: ')[1]
          if (!propertyValue) continue
          frontMatterProperties[property] = propertyValue
          bodyText = bodyText.replace(searchExp, '')
          break

        case 'delete':
          bodyText = bodyText.replace(searchExp, '')
          break

        case 'rename':
          const renameExp = new RegExp(`${property}::`, 'g')
          bodyText = bodyText.replace(renameExp, value.to + '::')
      }
    }

    if (this.options.find) {
      if (text.match(new RegExp(this.options.find, this.options.flags))) {
        bodyText = text.replace(
          new RegExp(this.options.find, this.options.flags),
          this.options.replace.replace(/\\n/g, '\n')
        )
      }
    }

    return frontMatter + bodyText
  }

  async process(preview?: boolean) {
    const previews: Preview[] = []

    for (let file of this.files) {
      const thisFile = app.vault.getAbstractFileByPath(file.file.path) as TFile

      let previewFrontmatter: Record<string, any> = {}
      let inlineProperties: Record<string, any> = {}
      let frontMatterProperties: Record<string, any> = {}

      await app.fileManager.processFrontMatter(thisFile, (frontmatter) => {
        previewFrontmatter = _.cloneDeep(frontmatter)

        this.modifyFrontmatterObject(file, previewFrontmatter, inlineProperties)
        if (!preview)
          this.modifyFrontmatterObject(file, frontmatter, inlineProperties)
      })

      const newText = await this.processText(
        file,
        thisFile,
        previewFrontmatter,
        inlineProperties,
        frontMatterProperties
      )

      const frontMatterPropertyEntries = _.entries(frontMatterProperties)
      if (frontMatterPropertyEntries.length > 0) {
        await app.fileManager.processFrontMatter(thisFile, (frontmatter) => {
          for (let [property, value] of frontMatterPropertyEntries) {
            frontmatter[property] = value
          }
        })
      }

      previews.push({
        title: thisFile.name,
        frontmatter: previewFrontmatter,
        text: newText,
      })

      if (!preview) app.vault.modify(thisFile, newText)
    }

    this.renderPreview(previews)
  }
}
