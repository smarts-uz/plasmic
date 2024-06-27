/** @format */
// This is a skeleton starter React component generated by Plasmic.
// This file is owned by you, feel free to edit as you see fit.
import { Preset } from "@/wab/client/code-components/code-presets";
import {
  AsChildInsertRelLoc,
  AsSiblingInsertRelLoc,
  InsertRelLoc,
  isAsChildRelLoc,
  isAsSiblingRelLoc,
} from "@/wab/client/components/canvas/view-ops";
import {
  checkAndNotifyUnsupportedHostVersion,
  checkAndNotifyUnsupportedReactVersion,
  notifyCodeLibraryInsertion,
} from "@/wab/client/components/modals/codeComponentModals";
import { getPreInsertionProps } from "@/wab/client/components/modals/PreInsertionModal";
import {
  getPlumeComponentTemplates,
  getPlumeImage,
} from "@/wab/client/components/plume/plume-display-utils";
import { PlumyIcon } from "@/wab/client/components/plume/plume-markers";
import { ImagePreview } from "@/wab/client/components/style-controls/ImageSelector";
import { Icon } from "@/wab/client/components/widgets/Icon";
import {
  AddFakeItem,
  AddInstallableItem,
  AddItem,
  AddItemType,
  AddTplItem,
  isTplAddItem,
} from "@/wab/client/definitions/insertables";
import {
  COMBINATION_ICON,
  COMPONENT_ICON,
  GROUP_ICON,
} from "@/wab/client/icons";
import {
  buildInsertableExtraInfo,
  getHostLessDependenciesToInsertableTemplate,
  getScreenVariantToInsertableTemplate,
  postInsertableTemplate,
} from "@/wab/client/insertable-templates";
import PlumeMarkIcon from "@/wab/client/plasmic/plasmic_kit_design_system/icons/PlasmicIcon__PlumeMark";
import { StudioCtx } from "@/wab/client/studio-ctx/StudioCtx";
import { ViewCtx } from "@/wab/client/studio-ctx/view-ctx";
import { trackEvent } from "@/wab/client/tracking";
import {
  assert,
  ensure,
  ensureArray,
  hackyCast,
  replaceAll,
  spawn,
  withoutNils,
} from "@/wab/common";
import {
  CodeComponent,
  DefaultComponentKind,
  getComponentDisplayName,
  getDefaultComponentLabel,
  isCodeComponent,
  isPlumeComponent,
  sortComponentsByName,
} from "@/wab/components";
import {
  HostLessComponentInfo,
  HostLessPackageInfo,
  InsertableTemplatesComponent,
  InsertableTemplatesItem,
  Installable,
} from "@/wab/devflags";
import { codeLit } from "@/wab/exprs";
import { Rect } from "@/wab/geom";
import { ImageAssetType } from "@/wab/image-asset-type";
import { syncGlobalContexts } from "@/wab/project-deps";
import { usedHostLessPkgs } from "@/wab/shared/cached-selectors";
import {
  appendCodeComponentMetaToModel,
  isPlainObjectPropType,
  syncPlumeComponent,
} from "@/wab/shared/code-components/code-components";
import { isTagListContainer } from "@/wab/shared/core/rich-text-util";
import {
  InsertableTemplateArenaExtraInfo,
  InsertableTemplateComponentExtraInfo,
  InsertableTemplateExtraInfo,
} from "@/wab/shared/insertable-templates/types";
import {
  Arena,
  Component,
  Expr,
  ImageAsset,
  isKnownTplNode,
  ProjectDependency,
  TplNode,
} from "@/wab/shared/model/classes";
import { isRenderableType } from "@/wab/shared/model/model-util";
import {
  canAddChildren,
  canAddSiblings,
  getSlotLikeType,
} from "@/wab/shared/parenting";
import { getParentOrSlotSelection } from "@/wab/shared/SlotUtils";
import { allComponents } from "@/wab/sites";
import { SlotSelection } from "@/wab/slots";
import { unbundleProjectDependency } from "@/wab/tagged-unbundle";
import * as Tpls from "@/wab/tpls";
import { notification } from "antd";
import { mapValues, uniqBy } from "lodash";
import * as React from "react";
import {
  cloneInsertableTemplate,
  cloneInsertableTemplateArena,
  cloneInsertableTemplateComponent,
} from "src/wab/shared/insertable-templates";
import { getPlumeEditorPlugin } from "src/wab/shared/plume/plume-registry";
import { getBaseVariant } from "src/wab/shared/Variants";

export function createAddTplImage(asset: ImageAsset): AddTplItem {
  return {
    type: AddItemType.tpl as const,
    key: `tpl-image-${asset.uuid}`,
    label: asset.name,
    canWrap: false,
    icon: (
      <ImagePreview
        style={{ width: 24, height: 24 }}
        uri={ensure(asset.dataUri, "asset should have dataUri")}
      />
    ),
    factory: (vc: ViewCtx) => vc.variantTplMgr().mkTplImage({ asset: asset }),
  };
}

type CreateAddInstallableExtraInfo = InsertableTemplateExtraInfo & {
  component?: Component;
  arena?: Arena;
};

export function createAddInstallable(meta: Installable): AddInstallableItem {
  return {
    type: AddItemType.installable as const,
    key: `installable-${meta.name}` as const,
    label: meta.name,
    isPackage: true,
    isNew: meta.isNew,
    previewImageUrl: meta.imageUrl,
    icon: GROUP_ICON,
    asyncExtraInfo: async (
      sc
    ): Promise<CreateAddInstallableExtraInfo | undefined> => {
      const { projectId, groupName } = meta;
      return sc.app.withSpinner(
        (async () => {
          await sc.projectDependencyManager.fetchInsertableTemplate(
            meta.projectId
          );
          const site =
            sc.projectDependencyManager.insertableSites[meta.projectId];
          const missingDeps = site.projectDependencies
            .filter(
              (d) =>
                !sc.site.projectDependencies.find((td) => d.pkgId === td.pkgId)
            )
            .map((d) => d.projectId);

          for (const id of missingDeps) {
            await sc.projectDependencyManager.addByProjectId(id);
          }
          const { screenVariant } = await getScreenVariantToInsertableTemplate(
            sc
          );

          const commonInfo: InsertableTemplateExtraInfo = {
            site,
            screenVariant,
            ...(await getHostLessDependenciesToInsertableTemplate(sc, site)),
            projectId,
            groupName,
            resolution: {
              token: "reuse-by-name",
              component: "reuse",
            },
          };
          if (meta.entryPoint.type === "arena") {
            const arena = site.arenas.find(
              (c) => c.name === meta.entryPoint.name
            );

            if (!arena) {
              return undefined;
            }

            return {
              ...commonInfo,
              arena,
            };
          }

          const component = site.components.find(
            (c) => c.name === meta.entryPoint.name
          );

          if (!component) {
            return undefined;
          }

          return {
            ...commonInfo,
            component,
          };
        })()
      );
    },
    factory: (sc: StudioCtx, extraInfo: CreateAddInstallableExtraInfo) => {
      if (!extraInfo) {
        return undefined;
      }
      if (meta.entryPoint.type === "arena") {
        if (!extraInfo.arena) {
          return undefined;
        }
        const { arena, seenFonts } = cloneInsertableTemplateArena(
          sc.site,
          extraInfo as InsertableTemplateArenaExtraInfo,
          sc.projectDependencyManager.plumeSite
        );
        postInsertableTemplate(sc, seenFonts);
        return arena;
      }

      if (!extraInfo.component) {
        return undefined;
      }

      const { component, seenFonts } = cloneInsertableTemplateComponent(
        sc.site,
        extraInfo as InsertableTemplateComponentExtraInfo,
        sc.projectDependencyManager.plumeSite
      );
      postInsertableTemplate(sc, seenFonts);

      return component;
    },
  };
}

export function createAddTplComponent(component: Component): AddTplItem {
  return {
    type: AddItemType.tpl as const,
    key: `tpl-component-${component.uuid}`,
    label: getComponentDisplayName(component),
    systemName: component.name,
    canWrap: false,
    icon: isPlumeComponent(component) ? (
      <PlumyIcon>{COMPONENT_ICON}</PlumyIcon>
    ) : (
      COMPONENT_ICON
    ),
    factory: (vc: ViewCtx) => {
      const tpl = vc.variantTplMgr().mkTplComponentWithDefaults(component);
      const plugin = getPlumeEditorPlugin(tpl.component);
      if (plugin) {
        plugin.onComponentInserted?.(component, tpl);
      }
      return tpl;
    },
    component,
  };
}

export function createAddTplCodeComponent(
  component: CodeComponent,
  showImages: boolean
): AddTplItem {
  const thumbUrl = component.codeComponentMeta.thumbnailUrl;
  return {
    ...createAddTplComponent(component),
    previewImageUrl: thumbUrl ?? undefined,
    // If we are showing images, we want to show the compact version of the item
    isCompact: showImages,
  };
}

export function createAddTplCodeComponents(
  components: CodeComponent[]
): AddTplItem[] {
  const uniqComponents = uniqBy(components, (c) => c.uuid);
  const shouldShowImages = uniqComponents.some(
    (c) => c.codeComponentMeta.thumbnailUrl
  );
  return sortComponentsByName(uniqComponents)
    .filter(isCodeComponent)
    .map((component) => {
      return createAddTplCodeComponent(component, shouldShowImages);
    });
}

export function createAddComponentPreset(
  studioCtx: StudioCtx,
  component: CodeComponent,
  preset: Preset
): AddTplItem {
  return {
    type: AddItemType.tpl as const,
    key: `preset-${component.uuid}-${preset.name}`,
    label: preset.name,
    icon: COMPONENT_ICON,
    factory: (vc: ViewCtx) => {
      const tpl = Tpls.clone(preset.tpl);
      const targetVariants = [vc.variantTplMgr().getBaseVariantForNewNode()];
      [...Tpls.findVariantSettingsUnderTpl(tpl)].forEach(([vs]) => {
        replaceAll(vs.variants, targetVariants);
      });
      return tpl;
    },
    previewImageUrl: preset.screenshot,
  };
}

export function createAddInsertableTemplate(
  meta: InsertableTemplatesItem
): AddTplItem<InsertableTemplateComponentExtraInfo> {
  return {
    type: AddItemType.tpl as const,
    key: `insertable-template-item-${meta.projectId}-${meta.componentName}`,
    label: meta.componentName,
    canWrap: false,
    icon: COMBINATION_ICON,
    previewImageUrl: meta.imageUrl,
    factory: (
      vc: ViewCtx,
      extraInfo: InsertableTemplateComponentExtraInfo,
      _drawnRect?: Rect
    ) => {
      trackEvent("Insertable template", {
        insertableName: extraInfo.component.name,
      });
      const targetComponent = vc.currentComponent();
      const { tpl, seenFonts } = cloneInsertableTemplate(
        vc.site,
        extraInfo,
        getBaseVariant(targetComponent),
        vc.studioCtx.projectDependencyManager.plumeSite,
        targetComponent
      );
      postInsertableTemplate(vc.studioCtx, seenFonts);
      return tpl;
    },
    asyncExtraInfo: async (
      sc
    ): Promise<InsertableTemplateComponentExtraInfo> => {
      const { screenVariant } = await getScreenVariantToInsertableTemplate(sc);
      return sc.app.withSpinner(
        (async () => {
          const info = await buildInsertableExtraInfo(
            sc,
            meta.projectId,
            meta.componentName,
            screenVariant
          );
          assert(info, () => `Cannot find template for ${meta.componentName}`);
          return info;
        })()
      );
    },
  };
}

type CreateAddTemplateComponentExtraInfo =
  | { type: "existing"; component: Component }
  | ({ type: "clone" } & InsertableTemplateComponentExtraInfo);

export function createAddTemplateComponent(
  meta: InsertableTemplatesComponent,
  defaultKind?: string
): AddTplItem<CreateAddTemplateComponentExtraInfo> {
  return {
    type: AddItemType.tpl as const,
    key: `insertable-template-component-${meta.projectId}-${meta.componentName}`,
    label: meta.displayName ?? meta.componentName,
    canWrap: false,
    icon: COMBINATION_ICON,
    previewImageUrl: meta.imageUrl,
    factory: (
      vc: ViewCtx,
      extraInfo: CreateAddTemplateComponentExtraInfo,
      _drawnRect?: Rect
    ) => {
      if (extraInfo.type === "existing") {
        return createAddTplComponent(extraInfo.component).factory(
          vc,
          extraInfo,
          _drawnRect
        );
      }
      trackEvent("Insertable template component", {
        insertableName: `${meta.projectId}-${meta.componentName}`,
      });
      const { component: comp, seenFonts } = cloneInsertableTemplateComponent(
        vc.site,
        extraInfo,
        vc.studioCtx.projectDependencyManager.plumeSite
      );
      if (defaultKind) {
        setTimeout(() => {
          void vc.studioCtx.change(({ success }) => {
            // ASK: If I try to do this, the Studio hangs (no longer responds to click events) and needs to be restarted. Why?
            // I had to put it inside a settimeout and then wrap it in a .change to make it work.
            vc.studioCtx
              .tplMgr()
              .addComponentToDefaultComponents(comp, defaultKind);
            return success();
          });
        }, 1000);
      }
      postInsertableTemplate(vc.studioCtx, seenFonts);
      return createAddTplComponent(comp).factory(vc, extraInfo, _drawnRect);
    },
    asyncExtraInfo: async (
      sc
    ): Promise<CreateAddTemplateComponentExtraInfo> => {
      const existing = allComponents(sc.site, {
        includeDeps: "all",
      }).find((comp) => comp.templateInfo?.name === meta.templateName);
      if (existing) {
        return {
          type: "existing",
          component: existing,
        };
      }
      const { screenVariant } = await getScreenVariantToInsertableTemplate(sc);
      return sc.app.withSpinner(
        (async () => {
          const info = await buildInsertableExtraInfo(
            sc,
            meta.projectId,
            meta.componentName,
            screenVariant
          );
          assert(
            info,
            () => `Template component ${meta.componentName} not found`
          );
          return {
            type: "clone",
            ...info,
          };
        })()
      );
    },
  };
}

export type HostLessComponentExtraInfo = {
  dep: ProjectDependency[];
  component: Component | undefined;
  args?: Record<string, Expr>;
};

export function createAddHostLessComponent(
  meta: HostLessComponentInfo,
  projectIds: string[]
): AddTplItem<HostLessComponentExtraInfo | false> {
  return {
    type: AddItemType.tpl as const,
    key: `hostless-component-${meta.componentName}`,
    label: meta.displayName,
    canWrap: false,
    icon: COMBINATION_ICON,
    previewImageUrl: meta.imageUrl,
    previewVideoUrl: meta.videoUrl,
    factory: (vc, ctx) => {
      if (!ctx) {
        return undefined;
      }
      const { component, args } = ctx;
      if (
        checkAndNotifyUnsupportedHostVersion(meta.requiredHostVersion) ||
        !component
      ) {
        return undefined;
      }
      return vc.variantTplMgr().mkTplComponentX({
        component,
        args,
      });
    },
    asyncExtraInfo: async (sc, opts) => {
      return await sc.app.withSpinner(
        (async () => {
          const { deps } = await installHostlessPkgs(sc, projectIds);
          if (!deps) {
            return false;
          }
          const component = ensure(
            deps
              .flatMap((dep2) => dep2.site.components)
              .find((c) => c.name === meta.componentName.split("/")[0]),
            "comp should exist"
          );
          const ccMeta = component && sc.getCodeComponentMeta(component);
          const args = meta.args
            ? mapValues(meta.args, (v) => codeLit(v))
            : undefined;
          if (
            opts?.isDragging ||
            !ccMeta ||
            !hackyCast(ccMeta).preInsertion ||
            !sc.appCtx.appConfig.schemaDrivenForms
          ) {
            return { dep: deps, component, args };
          }
          const argsPre = await getPreInsertionProps(sc, component);
          return args ? { dep: deps, component, args: argsPre } : false;
        })()
      );
    },
  };
}

export function createInstallOnlyPackage(
  meta: HostLessComponentInfo,
  packageMeta: HostLessPackageInfo
): AddFakeItem<HostLessComponentExtraInfo | false> {
  const projectIds = ensureArray(packageMeta.projectId);
  return {
    type: AddItemType.fake as const,
    key: `hostless-component-${meta.componentName}`,
    label: meta.displayName,
    icon: COMBINATION_ICON,
    isPackage: true,
    hostLessPackageInfo: packageMeta,
    hostLessComponentInfo: meta,
    previewImageUrl: meta.imageUrl,
    previewVideoUrl: meta.videoUrl,
    factory: (sc, ctx) => {
      if (!ctx || checkAndNotifyUnsupportedHostVersion()) {
        return false;
      }
      if (packageMeta.syntheticPackage) {
        sc.shownSyntheticSections.set(packageMeta.codeName, true);
      }
      return true;
    },
    asyncExtraInfo: async (sc) =>
      sc.app.withSpinner(
        (async () => {
          const { deps } = await installHostlessPkgs(sc, projectIds);
          if (!deps) {
            return false;
          }
          return { dep: deps, component: undefined };
        })()
      ),
  };
}

export function createFakeHostLessComponent(
  meta: HostLessComponentInfo,
  projectIds: string[]
): AddFakeItem<HostLessComponentExtraInfo | false> {
  return {
    type: AddItemType.fake as const,
    key: `hostless-component-${meta.componentName}`,
    label: meta.displayName,
    icon: COMBINATION_ICON,
    monospaced: meta.monospaced,
    description: meta.description,
    previewImageUrl: meta.imageUrl,
    previewVideoUrl: meta.videoUrl,
    factory: (sc, ctx) => {
      if (
        !ctx ||
        checkAndNotifyUnsupportedHostVersion(meta.requiredHostVersion)
      ) {
        return false;
      }
      ctx.dep.forEach((dep) => {
        const isCodeLibrary =
          dep.site.components.length === 0 && dep.site.codeLibraries.length > 0;
        if (!isCodeLibrary) {
          return;
        }
        dep.site.codeLibraries.forEach((lib) => {
          if (!dep.site.hostLessPackageInfo?.name) {
            return;
          }
          notifyCodeLibraryInsertion(
            dep.site.hostLessPackageInfo.name,
            lib.jsIdentifier,
            typeof sc
              .getRegisteredLibraries()
              .find((r) => r.meta.jsIdentifier === lib.jsIdentifier)?.lib
          );
        });
      });
      return true;
    },
    asyncExtraInfo: async (sc) => {
      return sc.app.withSpinner(
        (async () => {
          const { deps } = await installHostlessPkgs(sc, projectIds);
          if (!deps) {
            return false;
          }
          return { dep: deps, component: undefined };
        })()
      );
    },
  };
}

async function installHostlessPkgs(sc: StudioCtx, projectIds: string[]) {
  const existingDep = sc.site.projectDependencies.filter((dep) =>
    projectIds.includes(dep.projectId)
  );
  if (existingDep && existingDep.length === projectIds.length) {
    return {
      deps: existingDep,
    };
  }
  const projectDependencies = existingDep;
  const remainingProjectIds = projectIds.filter(
    (id) => !existingDep.some((dep) => dep.projectId === id)
  );
  for (const projectId of remainingProjectIds) {
    const { pkg: maybePkg } = await sc.appCtx.api.getPkgByProjectId(projectId);
    const pkg = ensure(maybePkg, "pkg must exist");
    const { pkg: latest, depPkgs } = await sc.appCtx.api.getPkgVersion(pkg.id);
    const { projectDependency } = unbundleProjectDependency(
      sc.bundler(),
      latest,
      depPkgs
    );
    projectDependencies.push(projectDependency);
  }

  if (checkAndNotifyUnsupportedReactVersion(sc, projectDependencies)) {
    return { deps: undefined };
  }
  await sc.updateCcRegistry([
    ...usedHostLessPkgs(sc.site),
    ...projectDependencies.flatMap((dep) => usedHostLessPkgs(dep.site)),
  ]);

  await sc.change(({ success }) => {
    for (const projectDependency of projectDependencies) {
      if (
        !sc.site.projectDependencies.some(
          (dep) => dep.pkgId === projectDependency.pkgId
        )
      ) {
        sc.site.projectDependencies.push(projectDependency);
        syncGlobalContexts(projectDependency, sc.site);
        sc.projectDependencyManager.syncDirectDeps();
        maybeShowGlobalContextNotification(sc, projectDependency);
      }
    }
    appendCodeComponentMetaToModel(
      sc.site,
      sc.getCodeComponentsAndContextsRegistration()
    );
    return success();
  });
  return { deps: projectDependencies };
}

export function createAddInsertableIcon(icon: ImageAsset): AddTplItem {
  return {
    type: AddItemType.tpl as const,
    key: `insertable-icon-${icon.uuid}`,
    label: icon.name,
    canWrap: false,
    icon: (
      <ImagePreview
        style={{ width: 24, height: 24 }}
        uri={ensure(icon.dataUri, "icon should have dataUri")}
      />
    ),
    factory: (vc: ViewCtx) => {
      trackEvent("Insertable icon", {
        type: icon.type,
        name: icon.name,
      });
      const clonedIcon = vc.tplMgr().addImageAsset({
        name: icon.name,
        type: icon.type as ImageAssetType,
        dataUri: icon.dataUri ?? undefined,
        width: icon.width ?? undefined,
        height: icon.height ?? undefined,
        aspectRatio: icon.aspectRatio ?? undefined,
      });
      return vc.variantTplMgr().mkTplImage({ asset: clonedIcon });
    },
  };
}

export function isInsertable(
  item: AddItem,
  vc: ViewCtx,
  target: TplNode | SlotSelection,
  insertLoc?: InsertRelLoc
) {
  if (!isTplAddItem(item)) {
    return false;
  }
  insertLoc = insertLoc ?? InsertRelLoc.append;
  if (insertLoc === InsertRelLoc.wrap && !item.canWrap) {
    return false;
  }

  if (!isAsChildRelLoc(insertLoc) && !isAsSiblingRelLoc(insertLoc)) {
    return false;
  }

  if (target instanceof SlotSelection && isAsSiblingRelLoc(insertLoc)) {
    // cannot insert as a sibling to a SlotSelection
    return false;
  }

  if (Tpls.isTplTag(target)) {
    if (
      (isTagListContainer(target.tag) && isAsChildRelLoc(insertLoc)) ||
      (target.tag === "li" && isAsSiblingRelLoc(insertLoc))
    ) {
      // Only list items can be added to "ul" and "ol" containers; and only
      // list items can be siblings of list items.
      return item.key === "li";
    }
  }

  const canAdd =
    (isAsChildRelLoc(insertLoc) && canAddChildren(target)) ||
    (isKnownTplNode(target) &&
      isAsSiblingRelLoc(insertLoc) &&
      canAddSiblings(target));

  if (item.type === "plume") {
    // Don't allow inserting new Plume components into constrained
    // slot.  We exit early this way instead of calling item.factory()
    // because doing so will actually create and attach the component
    // to the Site, even before we've done the insertion!
    return !isTargetConstrainedSlot(target, insertLoc) && canAdd;
  }

  if (item.asyncExtraInfo) {
    // Don't create tentatively throwaway tpl to check if it fits into
    // a constrained slot; instead, never allow them in constrained slots
    // for now.
    return !isTargetConstrainedSlot(target, insertLoc) && canAdd;
  }

  const toInsert = item.factory(vc, undefined);
  if (toInsert == null) {
    return false;
  }

  if (isAsChildRelLoc(insertLoc)) {
    return canAddChildren(target, toInsert);
  }

  if (isKnownTplNode(target) && isAsSiblingRelLoc(insertLoc)) {
    return canAddSiblings(target, toInsert);
  }

  return false;
}

function isTargetConstrainedSlot(
  target: TplNode | SlotSelection,
  insertLoc: AsChildInsertRelLoc | AsSiblingInsertRelLoc
) {
  if (isKnownTplNode(target) && isAsSiblingRelLoc(insertLoc)) {
    const parent = getParentOrSlotSelection(target);
    if (!parent) {
      return false;
    }
    target = parent;
  }
  if (Tpls.isTplSlot(target) || target instanceof SlotSelection) {
    const slotType = getSlotLikeType(target);
    if (isRenderableType(slotType)) {
      // Renderable with constraints set in params
      return slotType.params.length > 0;
    } else {
      // some constraint involved
      return false;
    }
  } else {
    return false;
  }
}

export function makePlumeInsertables(
  studioCtx: StudioCtx,
  filteredKind?: DefaultComponentKind
) {
  const plumeSite = studioCtx.projectDependencyManager.plumeSite;
  if (!plumeSite) {
    return [];
  }
  const plumeComponents = getPlumeComponentTemplates(studioCtx);

  const existingTypes = new Set(
    withoutNils([...studioCtx.site.components.map((c) => c.plumeInfo?.type)])
  );

  const items: AddItem[] = [];
  for (const component of plumeComponents) {
    if (
      !existingTypes.has(component.plumeInfo.type) &&
      (!filteredKind || component.plumeInfo.type === filteredKind)
    ) {
      items.push({
        type: AddItemType.plume,
        key: component.uuid,
        label: getDefaultComponentLabel(component.plumeInfo.type),
        canWrap: false,
        icon: <Icon icon={PlumeMarkIcon} />,
        factory: (vc: ViewCtx, extraInfo) => {
          const isComponentInserted = extraInfo.attachComponent;
          const newComponent = studioCtx
            .tplMgr()
            .clonePlumeComponent(
              plumeSite,
              component.uuid,
              component.name,
              isComponentInserted
            );
          syncPlumeComponent(studioCtx, newComponent).match({
            success: (x) => x,
            failure: (err) => {
              throw err;
            },
          });
          const tpl = vc
            .variantTplMgr()
            .mkTplComponentWithDefaults(newComponent);
          if (isComponentInserted) {
            const plugin = getPlumeEditorPlugin(newComponent);
            plugin?.onComponentInserted?.(vc.component, tpl);
          }
          return tpl;
        },
        asyncExtraInfo: async (_studioCtx, opts) => {
          return { attachComponent: !opts?.isDragging };
        },
        previewImageUrl: getPlumeImage(component.plumeInfo.type),
      });
    }
  }
  return items;
}

export function maybeShowGlobalContextNotification(
  studioCtx: StudioCtx,
  projectDependency: ProjectDependency
) {
  const key = "global-context-notification";
  const goToSettings = async () => {
    await studioCtx.change(({ success }) => {
      studioCtx.hideOmnibar();
      studioCtx.switchLeftTab("settings", { highlight: true });
      notification.close(key);
      return success();
    });
  };
  const tryExtractDataSourceProp = (c: Component) => {
    const meta = studioCtx.getHostLessContextsMap().get(c.name);
    if (!meta) {
      return undefined;
    }
    for (const p of c.params) {
      const propType = meta.meta.props[p.variable.name];
      if (
        isPlainObjectPropType(propType) &&
        (propType as any).type === "dataSource"
      ) {
        return [c, p.variable.name] as const;
      }
    }
    return undefined;
  };
  if (projectDependency.site.globalContexts.length > 0) {
    spawn(
      (async () => {
        // Fetch hostless packages
        await studioCtx.updateCcRegistry(usedHostLessPkgs(studioCtx.site));
        for (const globalContext of projectDependency.site.globalContexts) {
          const dataSourceProp = tryExtractDataSourceProp(
            globalContext.component
          );
          if (dataSourceProp) {
            await goToSettings();
            studioCtx.forceOpenProp = dataSourceProp;
            return;
          }
        }
        notification.info({
          message: "Project Settings",
          description: (
            <>
              <p>
                The {projectDependency.name} package can be configured in
                settings.
              </p>
              <a onClick={goToSettings}>Go to settings.</a>
            </>
          ),
          duration: 30,
          key,
        });
      })()
    );
  }
}
