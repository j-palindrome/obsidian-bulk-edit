import { Menu, Notice, Plugin, TAbstractFile } from 'obsidian'
import { getAPI } from 'obsidian-dataview'
import BulkEditModal from './BulkEditModal'

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
            .setTitle('Bulk Edit File')
            .setIcon('layout-list')
            .onClick(() =>
              new BulkEditModal(`"${file.path.replace('.md', '')}"`).open()
            )
        )
      })
    )

    this.addCommand({
      name: 'Bulk edit files',
      id: 'bulk-edit',
      callback: () => {
        new BulkEditModal('').open()
      },
    })

    this.addRibbonIcon('zap', 'Bulk Edit', () => new BulkEditModal('').open())
  }

  async loadSettings() {
    this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
