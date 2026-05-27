// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
// import * as Types from '$lib/types/types';
declare global {
  export type Field = {
    name: string
    type: string
    isArray: boolean
    isOptional: boolean
    isDataEntry: boolean
    attrs?: string
  }
  // no name; it should be part of Models with their name as a key
  export type Model = {
    fields: Field[]
    attrs?: string[]
  }
  export type Models = Record<string, Model>
  export type RouteName = string
  export type SelectedModels = Record<RouteName, Model>
  export type Payload = Record<
    string,
    SelectedModels | Model | string[] | string
  > // { route: string | null } = { route: null };
  export type RouteName = string
  export type Components = string[]
  export type SelectedModels = Record<RouteName, Model>
  export type Payload = Record<
    string,
    SelectedModels | Model | Components | string
  >
  export type TPaths = Record<string, string>
  export type DbParams = Record<string, string | number>

  // props for creating +page.svelte/+page.server.ts route pager
  export type TCreatePageProps = {
    routeName: string
    model: Model
  }
  type Position = { x: number; y: number; color: string } | undefined
  namespace App {
    // interface Error {}
    // interface Locals {
    // 	user: Types.UserPartial;
    // }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
