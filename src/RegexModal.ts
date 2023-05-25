import * as _ from 'lodash'
import {
	DropdownComponent,
	Menu,
	Modal,
	Notice,
	Plugin,
	Setting,
	TAbstractFile,
	TFile,
	TextComponent,
} from 'obsidian'
import { DataArray, DataviewApi, getAPI } from 'obsidian-dataview'
import invariant from 'tiny-invariant'
import $ from 'jquery'

export default class RegexModal extends Modal {
	file: TAbstractFile
	dv: DataviewApi
	files: DataArray<Record<string, any>>
	options: {
		find: string
		replace: string
		flags: string
	}
	previewElement: HTMLDivElement

	constructor(file: TAbstractFile) {
		super(app)
		this.file = file
		const dv = getAPI()
		invariant(dv)
		this.dv = dv
		this.files = this.dv.pages(`"${this.file.path}"`)
		this.options = {
			find: '',
			flags: '',
			replace: '',
		}
	}

	async process(preview = false) {
		const files = this.files['file']['path']
		console.log(this.options)

		const previews: { title: string; text: string }[] = []

		await Promise.all(
			files.map((file: string) => {
				const thisFile = app.vault.getAbstractFileByPath(file) as TFile
				return new Promise((resolve) => {
					app.vault.read(thisFile).then((text) => {
						if (
							text.match(
								new RegExp(
									this.options.find,
									this.options.flags
								)
							)
						) {
							text = text.replace(
								new RegExp(
									this.options.find,
									this.options.flags
								),
								this.options.replace.replace(/\\n/g, '\n')
							)

							if (preview) {
								previews.push({ title: file, text })
							} else {
								app.vault.modify(thisFile, text)
							}
						}
						resolve(true)
					})
				})
			})
		)

		if (preview) {
			this.previewElement.empty()
			const child = $(/*html*/ `
      <div style='font-family:var(--font-text);'>
            ${previews
				.map(
					({
						title,
						text,
					}) => /*html*/ `<h2 style='font-weight:bold;'>${title}</h2>
            <div style='white-space:pre-wrap;border-bottom:16px;'>${text}</div>`
				)
				.join('\n')}
        </div>
      `)[0]
			this.previewElement.appendChild(child)
		}
	}

	onOpen() {
		let { contentEl } = this

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
				button
					.onClick(() => this.process(true))
					.setButtonText('Preview')
			)
			.addButton((button) =>
				button.onClick(() => this.process()).setButtonText('Go')
			)

		this.previewElement = document.createElement('div')
		this.previewElement.style.setProperty('height', '200px')
		this.previewElement.style.setProperty('overflow-y', 'auto')
		this.previewElement.style.setProperty('overflow-x', 'hidden')
		this.previewElement.style.setProperty('width', '100%')
		contentEl.appendChild(this.previewElement)
	}
}
