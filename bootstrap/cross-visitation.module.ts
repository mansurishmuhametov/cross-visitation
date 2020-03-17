import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TitleFormModule } from 'crumbs_title-form';
import { LocalizationModule } from 'crumbs_localization-form';
import { QueryCriteriaSelectorModule } from 'retail_query-criteria-selector-form';

import { CrossVisitationRoutingModule } from './cross-visitation-routing.module';
import { CrossVisitationPageComponent } from '../ui/cross-visitation-page.component';
import { CrossVisitationTableListModule } from '../../../modules/cross-visitation-table-list';
import { CrossVisitationTableFilterModule } from '../../../modules/cross-visitation-table-filter';

/**
 * Модуль страницы Кросс-визиты
 */
@NgModule({
    imports: [
        CommonModule,
        CrossVisitationRoutingModule,
        TitleFormModule,
        LocalizationModule,
        CrossVisitationTableListModule,
        QueryCriteriaSelectorModule,
        CrossVisitationTableFilterModule
    ],
    declarations: [
        CrossVisitationPageComponent
    ]
})
export class CrossVisitationModule {}
