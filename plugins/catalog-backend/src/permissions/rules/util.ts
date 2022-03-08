/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Entity } from '@backstage/catalog-model';
import { RESOURCE_TYPE_CATALOG_ENTITY } from '@backstage/plugin-catalog-common';
import { makeCreatePermissionRule } from '@backstage/plugin-permission-node';
import { EntitiesSearchFilter } from '../../catalog/types';

/**
 * Helper function for creating correctly-typed
 * {@link @backstage/plugin-permission-node#PermissionRule}s for the
 * catalog-backend.
 *
 * @alpha
 */
export const createCatalogPermissionRule = makeCreatePermissionRule<
  typeof RESOURCE_TYPE_CATALOG_ENTITY,
  Entity,
  EntitiesSearchFilter
>();
