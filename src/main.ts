import { Menu, Notice, Plugin, TAbstractFile } from 'obsidian'
import { getAPI } from 'obsidian-dataview'
import MetadataWranglerModal from './MetadataWranglerModal'

interface MySettings {}
const DEFAULT_SETTINGS: MySettings = {}

export default class MetadataWrangler extends Plugin {
  settings: MySettings

  async onload() {
    const dv = getAPI()
    if (!dv) {
      new Notice('Please install Dataview to use Metadata Wrangler')
      return
    }

    await this.loadSettings()

    this.registerEvent(
      app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
        menu.addItem((item) =>
          item
            .setTitle('Wrangle Metadata')
            .setIcon('layout-list')
            .onClick(() =>
              new MetadataWranglerModal(
                `"${file.path.replace('.md', '')}"`
              ).open()
            )
        )
      })
    )

    this.addCommand({
      name: 'Bulk edit files',
      id: 'bulk-edit',
      callback: () => {
        new MetadataWranglerModal('').open()
      },
    })

    this.addRibbonIcon('zap', 'Bulk Edit', () =>
      new MetadataWranglerModal('').open()
    )
  }

  async loadSettings() {
    this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
