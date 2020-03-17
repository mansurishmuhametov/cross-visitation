import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, PRIMARY_OUTLET } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject, Observable, forkJoin, throwError, combineLatest, BehaviorSubject } from 'rxjs';
import { pluck, skipWhile, takeUntil, first, map, catchError, switchMap, scan } from 'rxjs/operators';
import * as _ from 'lodash';
import * as moment from 'moment';
import { ActiveToast, IndividualConfig, ToastrService } from 'ngx-toastr';

import * as fromFilter from 'retail_query-criteria-selector-form';
import { TranslateBaseService } from 'crumbs_localization-form';

import { EntitiesBaseService, PeriodsBaseService } from '@shared/services';
import { Layout, Period, Entity, Relation, EntityType, LayoutView, ParamRequestStatus } from '@shared/layouts';
import { UrlParamServiceBase } from '@core/modules/url-param';
import * as fromStore from '../../../shared/store';
import { UserSettingsStatus, UserSettingsStatusCode } from '@core/services/settings/user-settings/user-settings.type';
import { UserFilterSettingsServiceBase } from '@core/services/settings/user-settings/main-filter/user-filter-settings-base.service';
import { UserSettingsServiceBase } from '@core/services/settings/user-settings/user-settings-base.service';

const NO_NAME: string = 'n/a';
const DATE_FORMAT: string = 'YYYY-MM-DD';
const URL_KEY_ENTITY_TYPE: string = 'entityType';

/**
 * Компонент страницы 'Кросс-визиты'
 */
@Component({
    selector: 'cross-visitation-page',
    templateUrl: 'cross-visitation-page.component.html',
    styleUrls: [ 'cross-visitation-page.component.scss' ]
})
export class CrossVisitationPageComponent implements OnInit, OnDestroy {
    private destroy$: Subject<boolean> = new Subject<boolean>();
    private layout: Layout;
    private periods: Period[] = [];
    private entities: Entity[];
    private requiredEntities: Entity[];
    private selectedEntities: Entity[];
    private entitiesForFilter: fromFilter.Entities;
    private isEntitiesAverage: boolean;
    private leadEntityType: EntityType;
    private urlSegment: string;
    private pageSettings: any = {
        entitiesIds: [],
        periods: [],
        entityId: undefined,
        entityType: undefined
    };
    private paramRequestState: ParamRequestStatus = {
        entities: {},
        relations: {}
    };
    private retailFilterSetting: fromFilter.FilterSettings = {
        maxSelectedEntityCount: 5,
        hideResetButton: true,
        hideEntityAverage: true,
        hideComparePeriodAverage: true,
        elements: [ fromFilter.FilterElementType.Period, fromFilter.FilterElementType.Entity ],
        maxPeriodsCount: 1,
        mainPeriodForm: {
            dropdownSize: 'sm'
        },
        entityFilterForm: {
            dropdownSize: 'lg'
        }
    };
    private selectedEntityType: string;
    private entityIdForFiltering: string;
    private entityForFiltering: Entity;
    private crossVisitationForFilter: fromFilter.CrossVisitationTableFilter.EntityTypeSet & fromFilter.CrossVisitationTableFilter.EntitySet;
    private defaultFilterStateSubject$: BehaviorSubject<fromFilter.Filter> = new BehaviorSubject({});
    private defaultFilterState$: Observable<fromFilter.Filter>;
    private filterPresetGroup$: Observable<fromFilter.Presets.PresetGroup>;
    private userSettingsStatus$: Observable<UserSettingsStatus>;
    private toastForSettings: ActiveToast<any>;

    get FilterPresetGroup$(): Observable<fromFilter.Presets.PresetGroup> {
        return this.filterPresetGroup$;
    }

    get CrossVisitationForFilter(): fromFilter.CrossVisitationTableFilter.EntityTypeSet & fromFilter.CrossVisitationTableFilter.EntitySet {
        return this.crossVisitationForFilter;
    }

    get SelectedEntityType(): string {
        return this.selectedEntityType;
    }

    get EntityForFiltering(): Entity {
        return this.entityForFiltering;
    }

    get Layout(): Layout {
        return this.layout;
    }

    get Periods(): Period[] {
        return this.periods;
    }

    get Entities(): Entity[] {
        return this.entities;
    }

    get EntitiesForFilter(): fromFilter.Entities {
        return this.entitiesForFilter;
    }

    get SelectedEntities(): Entity[] {
        return this.selectedEntities;
    }

    get IsEntitiesAverage(): boolean {
        return this.isEntitiesAverage;
    }

    get LeadEntityType(): string {
        return this.leadEntityType;
    }

    get IsParamLoading(): boolean {
        return this.paramRequestState.entities.isLoading
            || this.paramRequestState.relations.isLoading;
    }

    get IsParamError(): boolean {
        return this.paramRequestState.entities.isError
            || this.paramRequestState.relations.isError;
    }

    get RetailFilterSetting(): fromFilter.FilterSettings {
        return this.retailFilterSetting;
    }

    constructor(
        private readonly commonSettingsStore: Store<fromStore.ICommonSettingsState>,
        private readonly router: Router,
        private readonly entitiesService: EntitiesBaseService,
        private readonly periodsService: PeriodsBaseService,
        private readonly filterSelectedParametersStorageService: fromFilter.SelectedParametersStorageBaseService,
        private readonly urlParamService: UrlParamServiceBase,
        private readonly translateService: TranslateBaseService,
        private readonly userFilterSettingsService: UserFilterSettingsServiceBase,
        private readonly userSettingsService: UserSettingsServiceBase,
        private readonly toastrService: ToastrService
    ) {
        this.initCrossVisitationForFilter();
        this.initDefaultFilterState();
        this.notificationForPresets();
    }

    /**
     * Инициализация компонента
     */
    public ngOnInit(): void {
        this.urlSegment = this.getLastUrlSegment();
        this.updateLayoutAndRouteParams();
    }

    /**
     * Уничтожение компонента
     */
    public ngOnDestroy(): void {
        this.removeActiveToastForSettings();
        this.destroy$.next(true);
        this.destroy$.complete();
    }

    /**
     * Принятие фильтра
     * @param filter - результат фильтров
     */
    public onAcceptFilter(filter: fromFilter.Filter): void {
        if (filter.periods) {
            const mainPeriod: any = this.periods[0];

            this.periods = filter.periods;

            if (!this.periodsService.isEqualPeriods(mainPeriod, filter.periods[0])) {
                this.initEntitiesFinderStore();
            }
        }

        if (filter.entity) {
            this.selectedEntities = _(filter.entity.ids)
                .map(id =>  _.find(this.entities, entity => entity.Id === id))
                .compact()
                .value();
        }

        if (filter.crossVisitation) {
            this.selectedEntityType = filter.crossVisitation.entityType;
            this.entityIdForFiltering = filter.crossVisitation.entityId;
            this.entityForFiltering = _.find(this.entities, entity => entity.Id === filter.crossVisitation.entityId);
        }

        this.updateFilterParametersInStorage();
        this.updatePageSetting();
    }

    /**
     * Обработка событий пресетов
     * @param presetAction - событие обновления пресетов страницы
     */
    public handlePresetAction(presetAction: fromFilter.Presets.Action): void {
        this.userFilterSettingsService.handlePresetAction(this.layout.Id, this.urlSegment, presetAction);
    }

    /**
     * Метод обновления текущей схемы размещения и праметров роута
     */
    private updateLayoutAndRouteParams(): void {
        const commonSettings$: Observable<fromStore.ILayout> = this.commonSettingsStore.select(fromStore.getCommonSettings)
            .pipe(
                pluck('layout'),
                skipWhile((layout: fromStore.ILayout) => _.isEmpty(layout.id))
            );

        combineLatest(commonSettings$)
            .pipe(
                takeUntil(this.destroy$)
            )
            // tslint:disable-next-line: max-func-body-length
            .subscribe(([layout]) => {
                this.layout = {
                    Id: layout.id,
                    View: <LayoutView> layout.type,
                    Title: layout.name || NO_NAME
                };

                this.updateLeadEntityType();
                this.acceptFilterByUrlParams();
                this.updatePageSetting();
                this.updateData();
            });

        this.initPresets(commonSettings$);
    }

    /**
     * Метод установки основного типа сущности
     */
    private updateLeadEntityType(): void {
        if (this.layout) {
            this.leadEntityType = this.entitiesService.getLeadEntityType(this.layout.View);
            this.retailFilterSetting = {
                ...this.retailFilterSetting,
                leadEntityType: this.leadEntityType
            };
        }
    }

    /**
     * Метод обновления настроек фильтра страницы из localstorage
     */
    private updatePageSetting(): void {
        const storageSetting: fromFilter.FilterSelectedParametersStorage.Parameters = this.filterSelectedParametersStorageService.getByLayoutAndPagePath(
            this.layout.Id,
            this.urlSegment
        );

        this.pageSettings.entitiesIds = _.get(storageSetting, 'entitiesIds');
        this.pageSettings.periods = _.get(storageSetting, 'periods');
        this.pageSettings.entityIsAverage = _.get(storageSetting, 'entitiesIsAverage');
        this.pageSettings.entityType = _.get(storageSetting, 'crossVisitation.entityType');
        this.pageSettings.entityId = _.get(storageSetting, 'crossVisitation.entityId');
    }

    /**
     * Обновление выбранных параметров фильтра в localStorage
     */
    private updateFilterParametersInStorage(): void {
        const parameters: any = {
            periods: this.periods,
            entitiesIds: _.map(this.selectedEntities, 'Id'),
            crossVisitation: {
                entityType: this.selectedEntityType,
                entityId: this.entityIdForFiltering
            }
        };
        this.filterSelectedParametersStorageService.updateConfigForLayoutAndPagePath(this.layout.Id, this.urlSegment, parameters);
    }

    /**
     * Метод обновления данных компонента
     */
    private updateData(): void {
        this.paramRequestState.entities.isLoading = true;
        this.paramRequestState.relations.isLoading = true;

        this.updatePeriods();
        this.initEntitiesFinderStore();
    }

    /**
     * Метод обновления списка периодов
     */
    private updatePeriods(): void {
        const defaultPeriods: Period[] = [{
            from: moment().startOf('week'),
            to: moment(),
            average: false,
            weekdays: []
        }];

        this.defaultFilterStateSubject$.next({
            periods: defaultPeriods
        });

        if (this.pageSettings.periods) {
            this.periods = _.map(this.pageSettings.periods, (item: any) => {
                return {
                    from: moment(item.from),
                    to: moment(item.to),
                    average: item.average,
                    weekdays: item.weekdays,
                    type: item.type
                };
            });
        } else {
            this.periods = defaultPeriods;
        }
    }

    /**
     * Метод инициализации хранилища искателя сущностей
     */
    private initEntitiesFinderStore(): void {
        forkJoin(this.updateEntities(), this.updateRelations())
            .pipe(
                first(),
                takeUntil(this.destroy$)
            )
            .subscribe(([ entities, relations ]) => {
                this.entitiesService.initEntityFinderStore(entities, relations);
            });
    }

    /**
     * Метод обновления списка сущностей с сервера
     */
    private updateEntities(): Observable<Entity[]> {
        const from: string = this.periods[0].from.format(DATE_FORMAT);
        const to: string = this.periods[0].to.format(DATE_FORMAT);

        this.paramRequestState.entities.isError = false;
        this.entitiesForFilter = { selected: [], list: [], average: false };

        return forkJoin(this.entitiesService.getEntities(this.layout.Id, from, to), this.entitiesService.getShopsterMapping(this.layout.Id))
            .pipe(
                map(([ entities, mapping ]) => {
                    this.entities = _.intersectionWith(entities, mapping, (entity, entityId) => entity.Id === entityId);

                    this.requiredEntities = this.entitiesService.filterEntitiesByTypes(this.entities, [ EntityType.Tenant, EntityType.Zone ]);
                    this.initEntitiesForFilter();
                    this.updateOptionalFilter();
                    this.paramRequestState.entities.isLoading = false;

                    return this.entities;
                }),
                catchError((error: any) => {
                    this.paramRequestState.entities.isError = true;

                    return throwError(error);
                })
            );
    }

    /**
     * Метод инициализации списка сущностей, необходимых для фильтра
     */
    private initEntitiesForFilter(): void {
        this.defaultFilterStateSubject$.next({
            entity: {
                ids: [_.get(_.head(this.requiredEntities), 'Id')],
                average: false
            }
        });

        let selectedEntityIds: string[] = this.pageSettings.entitiesIds
            ? this.pageSettings.entitiesIds
            : _.map(this.selectedEntities, 'Id');
        let selectedEntities: Entity[] = _(selectedEntityIds)
            .map(id => _.find(this.requiredEntities, { Id: id }))
            .compact()
            .value();

        if (_.isEmpty(selectedEntities)) {
            selectedEntities = _.take(this.requiredEntities);
            selectedEntityIds = _.map(selectedEntities, 'Id');
        }

        this.selectedEntities = selectedEntities;
        if (this.pageSettings.entityIsAverage) {
            this.isEntitiesAverage = _.get(this.pageSettings, 'entityIsAverage', false);
        }
        this.entitiesForFilter = {
            average: this.isEntitiesAverage,
            selected: selectedEntityIds,
            list: this.entitiesService.mappingEntitiesForFilter(this.requiredEntities)
        };
    }

    /**
     * Метод обновления списка связей с сервера
     */
    private updateRelations(): Observable<Relation[]> {
        const from: string = this.periods[0].from.format(DATE_FORMAT);
        const to: string = this.periods[0].to.format(DATE_FORMAT);

        this.paramRequestState.relations.isError = false;

        return this.entitiesService.getRelations(this.layout.Id, from, to)
            .pipe(
                map((relations: Relation[]) => {
                    this.paramRequestState.relations.isLoading = false;

                    return relations;
                }),
                catchError((error: any) => {
                    this.paramRequestState.relations.isError = true;

                    return throwError(error);
                })
            );
    }

    /**
     * Возвращает последний сегмент url строки
     */
    private getLastUrlSegment(): string {
        return _.last(this.router.parseUrl(this.router.url).root.children[PRIMARY_OUTLET].segments).path;
    }

    /**
     * Принятие параметров фильтра из url параметров
     */
    private acceptFilterByUrlParams(): void {
        const entityId: string = this.urlParamService.getEntityId();
        const periodList: Period[] = this.urlParamService.getPeriodList();
        const entityType: string = this.urlParamService.get(URL_KEY_ENTITY_TYPE);

        if (entityId && periodList.length && entityType) {
            this.filterSelectedParametersStorageService.updateConfigForLayoutAndPagePath(this.layout.Id, this.urlSegment, {
                entitiesIds: [entityId],
                periods: periodList,
                crossVisitation: {
                    entityType: entityType
                }
            });
            this.selectedEntityType = entityType;
        }
    }

    /**
     * Метод обновления парамтеров дополнительного фильтра
     */
    private updateOptionalFilter(): void {
        this.updateSelectedEntityType();
        this.updateEntityForFiltering();

        const zonesAndFloors: Entity[] = _.filter(this.entities, (entity: Entity) => _.includes([ EntityType.Zone, EntityType.Floor ], entity.Type));

        this.defaultFilterStateSubject$.next({
            crossVisitation: {
                entityType: EntityType.Tenant,
                entityId: undefined,
                entityTypeTitle: this.translateService.get(`crossVisitationPage.filter.entityType.${EntityType.Tenant}`),
                entityTitle: undefined
            }
        });

        this.crossVisitationForFilter = {
            entities: this.entitiesService.mappingEntitiesForFilter(zonesAndFloors),
            selectedId: this.entityIdForFiltering,
            selectedTypeKey: this.selectedEntityType,
            entityTypes: this.createEntityTypeListForFilter()
        };
    }

    /**
     * Создание списка типов сущностей для фильтра
     */
    private createEntityTypeListForFilter(): fromFilter.CrossVisitationTableFilter.EntityType[] {
        const result: fromFilter.CrossVisitationTableFilter.EntityType[] = [];

        const requiredEntityTypes: string[] = [EntityType.Tenant, EntityType.Zone];
        _.forEach(requiredEntityTypes, (type) => {
            const isDefined: boolean = _.some(this.entities, entity => entity.Type === type);
            if (isDefined) {
                result.push({
                    key: type,
                    name: this.translateService.get(`crossVisitationPage.filter.entityType.${type}`)
                });
            }
        });

        return result;
    }

    /**
     * Метод обновления параметра selectedEntityType
     */
    private updateSelectedEntityType(): void {
        let entity: Entity = _.find(this.entities, item => item.Type === this.selectedEntityType);

        if (!entity) {
            entity = _.find(this.entities, item => item.Type === this.leadEntityType);
        }

        if (this.pageSettings.entityType) {
            this.selectedEntityType = this.pageSettings.entityType;
        } else {
            this.selectedEntityType = _.get(entity, 'Type', null);
        }
    }

    /**
     * Метод обновления параметра entityForFiltering
     */
    private updateEntityForFiltering(): void {
        if (this.pageSettings.entityId) {
            this.entityIdForFiltering = this.pageSettings.entityId;
        }
        if (this.entityIdForFiltering) {
            const entity: Entity = _.find(this.entities, item => item.Id === this.entityIdForFiltering);
            this.entityIdForFiltering = _.get(entity, 'Id');
            this.entityForFiltering = entity;
        }
    }

    /**
     * Инициализация фильтров кросс визитов
     */
    private initCrossVisitationForFilter(): void {
        this.crossVisitationForFilter = {
            entities: [],
            entityTypes: [],
            selectedTypeKey: undefined,
            selectedId: undefined
        };
    }

    /**
     * Инициализация пресетов
     * @param layout$ - поток схемы размещения
     */
    private initPresets(layout$: Observable<fromStore.ILayout>): void {
        this.filterPresetGroup$ = layout$.pipe(
            switchMap((layout: fromStore.ILayout) =>
                combineLatest(
                    this.userFilterSettingsService.getFilterPresets(layout.id, this.urlSegment),
                    this.defaultFilterState$
                ).pipe(
                    map((presets: [fromFilter.Presets.PresetGroup, fromFilter.Filter]) => ({
                        ...presets[0],
                        default: presets[1]
                    }))
                )
            )
        );
    }

    /**
     * Инициализация состояния фильтра по умолчанию
     */
    private initDefaultFilterState(): void {
        this.defaultFilterState$ = this.defaultFilterStateSubject$.pipe(
            scan((filterState, props) => ({
                ...filterState,
                ...props
            }))
        );
    }

    /**
     * Оповещение для пресетов
     */
    private notificationForPresets(): void {
        this.userSettingsStatus$ = this.userSettingsService.getStatus().pipe(takeUntil(this.destroy$));
        // tslint:disable-next-line: max-func-body-length
        this.userSettingsStatus$.subscribe((status: UserSettingsStatus) => {
            const options: {
                [P in keyof IndividualConfig]?: IndividualConfig[P];
            } = {};
            this.removeActiveToastForSettings();
            if (status.code === UserSettingsStatusCode.Status102) {
                options.tapToDismiss = true;
                this.toastForSettings = this.toastrService.info(status.message, '', options);
            }
        });
    }

    /**
     * Удалить активное окно нотификации для настроек
     */
    private removeActiveToastForSettings(): void {
        if (this.toastForSettings) {
            this.toastrService.remove(this.toastForSettings.toastId);
        }
    }
}
