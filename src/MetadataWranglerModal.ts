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
import { DataArray, DataviewApi, getAPI } from 'obsidian-dataview'
import invariant from 'tiny-invariant'

export default class MetadataWranglerModal extends Modal {
  file: TAbstractFile
  dv: DataviewApi
  files: DataArray<Record<string, any>>
  options: {
    convertToLowercase: boolean
    syncLinksInMetadata: boolean
  }
  edits: {
    property: Record<
      string,
      { action: 'rename'; to: string } | { action: 'delete' }
    >
    tag: Record<string, { action: 'delete' } | { action: 'add' }>
  }
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
    }
    this.edits = { property: {}, tag: {} }
    this.files = this.dv.pages(`"${this.file.path}"`)
  }

  updatePropertyEdits(type: 'tag' | 'property') {
    const displayProperty =
      type === 'tag' ? this.displayTags : this.displayProperties
    invariant(displayProperty)
    displayProperty.empty()
    const display = $(/*html*/ `
			<ul>
				${_.sortBy(_.entries(this.edits[type]), 0)
          .map(
            ([property, value]) =>
              /*html*/ `<li>${property}: ${value.action.toUpperCase()}${
                value.action === 'rename' ? ` to ${value.to}` : ''
              }</li>`
          )
          .join('\n')}
			</ul>`)[0] as HTMLUListElement
    displayProperty.appendChild(display)
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

    const createEditSettings = () => {
      const type = 'property'
      const editProperty = new Setting(contentEl)
      let renameText: TextComponent
      let renameDropdown: DropdownComponent

      editProperty.setName(`Edit Property`).addDropdown((dropdown) => {
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
        renameDropdown = dropdown
      })

      editProperty.addButton((button) => {
        button.onClick(() => {
          renameText?.setValue('')
          this.edits[type][renameDropdown?.getValue()] = {
            action: 'delete',
          }
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Delete')
      })

      editProperty.addText((text) => {
        text.onChange((value) => {
          invariant(renameDropdown)
          this.edits[type][renameDropdown.getValue()] = {
            action: 'rename',
            to: value,
          }
          renameText = text
          this.updatePropertyEdits(type)
        })
      })

      editProperty.addButton((button) => {
        button.onClick(() => {
          const property = renameDropdown.getValue()
          if (this.edits[type][property]?.action !== 'rename')
            this.edits[type][property] = {
              action: 'rename',
              to: '',
            }
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Rename')
      })

      editProperty.addButton((button) => {
        button.onClick(() => {
          invariant(renameDropdown)
          delete this.edits[type][renameDropdown?.getValue()]
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Cancel')
      })

      this.displayProperties = contentEl.appendChild(
        document.createElement('div')
      )
    }

    const createEditTagSettings = () => {
      const type = 'tag'
      const editTag = new Setting(contentEl)
      let selectTagDropdown: DropdownComponent
      let addTagText: TextComponent

      editTag.setName(`Edit Tag`).addDropdown((dropdown) => {
        const options = _.fromPairs(
          _.uniq(this.files['file']['tags']).map((x: string) => {
            const formatted = x.toLowerCase().slice(1)
            return [formatted, formatted] as [string, string]
          })
        )
        dropdown.addOptions(options)
        selectTagDropdown = dropdown
      })

      editTag.addButton((button) => {
        button.onClick(() => {
          this.edits[type][selectTagDropdown?.getValue()] = {
            action: 'delete',
          }
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Delete')
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

      editTag.addButton((button) => {
        button.onClick(() => {
          if (!currentAddTagValue) return
          this.edits[type][currentAddTagValue] = {
            action: 'add',
          }
          addTagText.setValue('')
          currentAddTagValue = ''
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Add')
      })

      editTag.addButton((button) => {
        button.onClick(() => {
          selectTagDropdown?.getValue() &&
            delete this.edits[type][selectTagDropdown?.getValue()]
          if (addTagText?.getValue()) {
            delete this.edits[type][addTagText?.getValue()]
            addTagText.setValue('')
          }
          this.updatePropertyEdits(type)
        })
        button.setButtonText('Cancel')
      })

      this.displayTags = contentEl.appendChild(document.createElement('div'))
    }

    createEditSettings()
    createEditTagSettings()

    new Setting(contentEl)
      .setName('Convert properties to lowercase')
      .setDesc('All YAML properties will be renamed as lowercase.')
      .addToggle((toggle) =>
        toggle.onChange((value) => (this.options.convertToLowercase = value))
      )

    new Setting(contentEl)
      .setName('Sync links with metadata')
      .setDesc(
        'Any list of links below a final divider ("---") will be added to the YAML metadata.'
      )
      .addToggle((toggle) =>
        toggle.onChange((value) => (this.options.syncLinksInMetadata = value))
      )

    new Setting(contentEl).addButton((button) =>
      button.setButtonText('Go').onClick(() => {
        confirm(`Edit ${this.files.length} files?`) && this.process()
      })
    )
  }

  async process() {
    const { syncLinksInMetadata: syncingLinksInMetadata, convertToLowercase } =
      this.options
    const propertyEdits = _.entries(this.edits.property)
    const tagEdits = _.entries(this.edits.tag)
    const editingProperties = propertyEdits.length > 0
    const editingTags = tagEdits.length > 0

    for (let file of this.files) {
      const thisFile = app.vault.getAbstractFileByPath(file.file.path) as TFile

      if (editingProperties) {
        app.fileManager.processFrontMatter(thisFile, (frontmatter) => {
          for (let [property, value] of propertyEdits) {
            if (!frontmatter[property]) continue
            switch (value.action) {
              case 'rename':
                frontmatter[value.to] = frontmatter[property]
                delete frontmatter[property]
                break
              case 'delete':
                delete frontmatter[property]
                break
            }
          }
        })
      }

      if (convertToLowercase) {
        app.fileManager.processFrontMatter(
          thisFile,
          (frontmatter: Record<string, any>) => {
            for (let property of _.keys(frontmatter)) {
              frontmatter[property.toLowerCase()] = frontmatter[property]
              delete frontmatter[property]
            }
          }
        )
      }

      if (syncingLinksInMetadata || editingTags) {
        app.vault.process(thisFile, (text) => {
          const frontMatter = text.match(/^---(.|\n)+?---/)?.[0] || ''
          let bodyText = text.replace(frontMatter, '')
          const finalMatterStart = bodyText.lastIndexOf('\n---\n')
          let finalMatter: string
          if (finalMatterStart === -1) {
            finalMatter = '\n---\n'
          } else {
            finalMatter = bodyText.slice(finalMatterStart)
            bodyText = bodyText.slice(0, finalMatterStart)
          }

          const editTags = () => {
            if (!editingTags) return
            const frontMatterTags: string[] = file.tags ?? []
            const allTags = file.file.tags.values

            for (let [tag, edit] of tagEdits) {
              switch (edit.action) {
                case 'delete':
                  if (!allTags.includes('#' + tag)) continue
                  if (frontMatterTags.includes(tag)) {
                    app.fileManager.processFrontMatter(
                      thisFile,
                      (frontmatter) => {
                        _.pull(frontmatter.tags, tag)
                      }
                    )
                  }
                  bodyText = bodyText.replace(
                    new RegExp(`#${tag}[\W$]?`, 'g'),
                    ''
                  )
                  finalMatter = finalMatter.replace(
                    new RegExp(`#${tag}[\W$]?`, 'g'),
                    ''
                  )
                  break
                case 'add':
                  app.fileManager.processFrontMatter(
                    thisFile,
                    (frontmatter) => {
                      if (!frontmatter.tags) frontmatter.tags = [tag]
                      else frontmatter.tags.push(tag)
                    }
                  )
                  break
              }
            }
          }

          editTags()

          const syncLinksInMetadata = () => {
            if (!syncingLinksInMetadata) return
            const propertyMatches = finalMatter.match(
              /^\w+:\n(- \[\[.*?\]\]\n?)+/gm
            )

            if (!propertyMatches) return
            for (let propertyListedLinks of propertyMatches) {
              const lines = propertyListedLinks.split('\n').filter((x) => x)
              let propName = lines[0].match(/\w+/)?.[0].toLowerCase()
              invariant(propName)

              const relations = lines
                .slice(1)
                .map((relation) => relation.match(/\[\[.*?\]\]/)?.[0] as string)

              const editedProperty =
                editingProperties &&
                propertyEdits.find(([property, value]) => property === propName)
              if (editedProperty) {
                // rename the text first
                switch (editedProperty[1].action) {
                  case 'delete':
                }

                finalMatter = finalMatter.replace(
                  propertyListedLinks,
                  editedProperty[1].action === 'delete'
                    ? ''
                    : editedProperty[1].action === 'rename'
                    ? propertyListedLinks.replace(
                        new RegExp(`^${propName}`, 'i'),
                        editedProperty[1].to
                      )
                    : propertyListedLinks
                )

                if (editedProperty[1].action === 'rename')
                  propName = editedProperty[1].to
              }

              if (relations.length > 0) {
                app.fileManager.processFrontMatter(thisFile, (frontmatter) => {
                  invariant(propName)
                  frontmatter[propName] = relations
                })
              }
            }
          }

          syncLinksInMetadata()

          return frontMatter + bodyText + finalMatter
        })
      }
    }
  }
}
