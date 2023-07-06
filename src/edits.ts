import _ from 'lodash'
import { TFile, TFolder } from 'obsidian'
import invariant from 'tiny-invariant'

export const findInlineFieldsRegex = (property: string) =>
  new RegExp(`(^|\\[|\\()${property}:: .*?(\\]|\\)|$)\\n?`, 'gim')

async function getTextAndMetadata(thisFile: TFile): Promise<EditedFile> {
  let text = await app.vault.read(thisFile)
  let metadata = {}
  await app.fileManager.processFrontMatter(
    thisFile,
    (frontmatter) => (metadata = frontmatter)
  )
  return { text, metadata }
}

async function setTextAndMetadata(
  thisFile: TFile,
  { text, metadata }: EditedFile
) {
  await app.vault.modify(thisFile, text)
  await app.fileManager.processFrontMatter(thisFile, (frontmatter) => {
    for (let property of _.keys(metadata))
      frontmatter[property] = metadata[property]
    for (let deletedProperty of _.difference(
      _.keys(frontmatter),
      _.keys(metadata)
    )) {
      delete metadata[deletedProperty]
    }
  })
}

export async function processMoveFiles(
  thisFile: TFile,
  edit: Edit,
  preview: boolean
): Promise<PreviewFile> {
  invariant(edit?.type === 'moveFiles')
  const metadata = {}
  const targetFolder = app.vault.getAbstractFileByPath(edit.edit) as TFolder
  if (!(targetFolder instanceof TFolder)) throw new Error('path not a folder')

  const newFileName = edit.edit + '/' + thisFile.name
  if (!preview) app.fileManager.renameFile(thisFile, newFileName)
  return { text: `MOVED TO ${newFileName}`, metadata, title: thisFile.name }
}

export async function processCustomJS(
  thisFile: TFile,
  edit: Edit,
  preview: boolean
): Promise<PreviewFile> {
  invariant(edit?.type === 'customJS')

  let { text, metadata } = await getTextAndMetadata(thisFile)

  const customFunction = eval(`({text, frontmatter}) => {
      ${edit.edit}
      return text
    }`)
  text = customFunction({ text, metadata })
  if (!preview) {
    setTextAndMetadata(thisFile, { text, metadata })
  }
  return { text, metadata, title: thisFile.name }
}

export async function processFindAndReplace(
  thisFile: TFile,
  edit: Edit,
  preview: boolean
): Promise<PreviewFile> {
  invariant(edit?.type === 'findAndReplace')

  let text = await app.vault.read(thisFile)
  if (new RegExp(edit.edit.find, edit.edit.flags).test(text)) {
    text = text.replace(
      new RegExp(edit.edit.find, edit.edit.flags),
      edit.edit.replace.replace(/\\n/g, '\n')
    )
    if (!preview) app.vault.modify(thisFile, text)
  }
  return { metadata: {}, text, title: thisFile.name }
}

export async function processProperties(
  thisFile: TFile,
  edit: Edit,
  preview: boolean,
  dataviewFile: Record<string, any>
): Promise<PreviewFile> {
  invariant(edit?.type === 'property')

  let { text, metadata } = await getTextAndMetadata(thisFile)

  for (let [property, thisEdit] of _.entries(edit.edit)) {
    const searchExp = findInlineFieldsRegex(property)
    switch (thisEdit.action) {
      case 'frontmatter':
        const inlineProperty = text.match(searchExp)?.[0]
        if (!inlineProperty) continue
        const propertyValue = inlineProperty
          .replace(/^\[\(/, '')
          .replace(/\]\)\n?$/, '')
          .split(':: ')[1]
        if (!propertyValue) continue
        metadata[property] = propertyValue
        text = text.replace(searchExp, '')
        break

      case 'delete':
        text = text.replace(searchExp, '')
        delete metadata[property]
        break

      case 'rename':
        const renameExp = new RegExp(`(\[|^)${property}::`, 'gm')
        text = text.replace(renameExp, thisEdit.to + '::')
        if (metadata[property]) {
          metadata[thisEdit.to] = metadata[property]
          delete metadata[property]
        }
        break

      case 'inline':
        if (metadata[property]) {
          const searchExp = findInlineFieldsRegex(property)
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
        const taggedProperty = dataviewFile[property]
        if (!taggedProperty || typeof taggedProperty !== 'string') continue
        const newTags = taggedProperty
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
        if (metadata.tags && metadata.tags instanceof Array)
          metadata.tags.push(...newTags)
        else metadata.tags = newTags
        metadata.tags = _.uniq(metadata.tags)
        break
    }
  }

  if (!preview) setTextAndMetadata(thisFile, { text, metadata })

  return { text, metadata, title: thisFile.name }
}

export async function processTags(
  thisFile: TFile,
  edit: Edit,
  preview: boolean
): Promise<PreviewFile> {
  invariant(edit?.type === 'tag')

  let { text, metadata } = await getTextAndMetadata(thisFile)

  for (let [tag, thisEdit] of _.entries(edit.edit)) {
    switch (thisEdit.action) {
      case 'delete':
        text = text.replace(new RegExp(`#${tag}[\W$]?`, 'g'), '')
        if (
          metadata.tags &&
          metadata.tags instanceof Array &&
          metadata.tags.includes(tag)
        ) {
          _.pull(metadata.tags, tag)
        } else if (
          metadata.tags &&
          typeof metadata.tags === 'string' &&
          metadata.tags.includes(tag)
        ) {
          metadata.tags = metadata.tags.replace(new RegExp(tag, 'gi'), '')
        }
        break

      case 'add':
        if (!metadata.tags) metadata.tags = [tag]
        else if (metadata.tags instanceof Array) metadata.tags.push(tag)
        else metadata.tags += ' ' + tag
        break
    }
  }

  if (!preview) setTextAndMetadata(thisFile, { text, metadata })

  return { text, metadata, title: thisFile.name }
}
