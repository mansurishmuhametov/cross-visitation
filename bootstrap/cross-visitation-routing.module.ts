import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CrossVisitationPageComponent } from '../ui/cross-visitation-page.component';

const crossVisitationRoutes: Routes = [
    {
        path: '',
        component: CrossVisitationPageComponent
    }
];

/**
 * Маршрутизация модуля "Кросс-визиты"
 */
@NgModule({
    imports: [
        RouterModule.forChild(crossVisitationRoutes)
    ],
    exports: [
        RouterModule
    ]
})
export class CrossVisitationRoutingModule {}