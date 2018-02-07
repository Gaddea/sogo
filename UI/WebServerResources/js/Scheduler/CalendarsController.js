/* -*- Mode: javascript; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

(function() {
  'use strict';

  /**
   * @ngInject
   */
  CalendarsController.$inject = ['$rootScope', '$scope', '$window', '$mdDialog', '$log', '$mdToast', 'Dialog', 'sgSettings', 'Preferences', 'Calendar'];
  function CalendarsController($rootScope, $scope, $window, $mdDialog, $log, $mdToast, Dialog, Settings, Preferences, Calendar) {
    var vm = this;

    vm.activeUser = Settings.activeUser;
    vm.service = Calendar;
    vm.newCalendar = newCalendar;
    vm.addWebCalendar = addWebCalendar;
    vm.subscribeToFolder = subscribeToFolder;

    vm.filter = { name: '' };
    vm.sortableMode = false;
    vm.toggleSortableMode = toggleSortableMode;
    vm.resetSort = resetSort;
    vm.sortableCalendars = {
      scrollableContainer: '#sidenav-content',
      containment: 'md-list',
      orderChanged: _sortableEnd,
      accept: _sortableAccept
    };

    this.$onInit = function() {
      vm.categories = _.map(Preferences.defaults.SOGoCalendarCategories, function(name) {
        return { id: name.asCSSIdentifier(),
                 name: name,
                 color: Preferences.defaults.SOGoCalendarCategoriesColors[name]
               };
      });

      // Dispatch the event named 'calendars:list' when a calendar is activated or deactivated or
      // when the color of a calendar is changed
      $scope.$watch(
        function() {
          return _.union(
            _.map(Calendar.$calendars, function(o) { return _.pick(o, ['id', 'active', 'color']); }),
            _.map(Calendar.$subscriptions, function(o) { return _.pick(o, ['id', 'active', 'color']); }),
            _.map(Calendar.$webcalendars, function(o) { return _.pick(o, ['id', 'active', 'color']); })
          );
        },
        function(newList, oldList) {
          var commonList, ids, promise;

          // Identify which calendar has changed
          commonList = _.intersectionBy(newList, oldList, 'id');
          ids = _.map(_.filter(commonList, function(o) {
            var oldObject = _.find(oldList, { id: o.id });
            return !_.isEqual(o, oldObject);
          }), 'id');
          promise = Calendar.$q.when();

          if (ids.length > 0) {
            $log.debug(ids.join(', ') + ' changed');
            promise = Calendar.saveFoldersActivation(ids);
          }
          if (ids.length > 0 || commonList.length != newList.length || commonList.length != oldList.length)
            promise.then(function() {
              $rootScope.$emit('calendars:list');
            });
        },
        true // compare for object equality
      );
    };

    /**
     * Only allow to sort items within the same list.
     */
    function _sortableAccept(sourceItemHandleScope, destSortableScope, destItemScope) {
      return sourceItemHandleScope.sortableScope.element[0] == destSortableScope.element[0];
    }

    function _sortableEnd() {
      Calendar.saveFoldersOrder(_.flatMap(Calendar.$findAll(), 'id'));
    }

    function toggleSortableMode() {
      vm.sortableMode = !vm.sortableMode;
      vm.filter.name = '';
    }

    function resetSort() {
      Calendar.saveFoldersOrder();
    }

    function newCalendar(ev) {
      Dialog.prompt(l('New calendar'), l('Name of the Calendar'))
        .then(function(name) {
          var calendar = new Calendar(
            {
              name: name,
              isEditable: true,
              isRemote: false,
              owner: UserLogin
            }
          );
          calendar.$id().then(function() {
            Calendar.$add(calendar);
          });
        });
    }

    function addWebCalendar() {
      Dialog.prompt(l('Subscribe to a web calendar...'), l('URL of the Calendar'), {inputType: 'url'})
        .then(function(url) {
          Calendar.$addWebCalendar(url).then(function(calendar) {
            if (angular.isObject(calendar)) {
              // Web calendar requires HTTP authentication
              $mdDialog.show({
                parent: angular.element(document.body),
                clickOutsideToClose: true,
                escapeToClose: true,
                templateUrl: 'UIxWebCalendarAuthDialog',
                controller: WebCalendarAuthDialogController,
                controllerAs: '$WebCalendarAuthDialogController',
                locals: {
                  url: url,
                  calendar: calendar
                }
              });
            }
          });
        });

      /**
       * @ngInject
       */
      WebCalendarAuthDialogController.$inject = ['scope', '$mdDialog', 'url', 'calendar'];
      function WebCalendarAuthDialogController(scope, $mdDialog, url, calendar) {
        var vm = this,
            parts = url.split("/"),
            hostname = parts[2];

        vm.title = l("Please identify yourself to %{0}").formatted(hostname);
        vm.url = url;
        vm.authenticate = function(form) {
          if (form.$valid || !form.$error.required) {
            calendar.setCredentials(vm.username, vm.password).then(function(message) {
              $mdDialog.hide();
            }, function(reason) {
              form.password.$setValidity('credentials', false);
            });
          }
        };
        vm.cancel = function() {
          $mdDialog.cancel();
        };
      }
    }


    // Callback of sgSubscribe directive
    function subscribeToFolder(calendarData) {
      $log.debug('subscribeToFolder ' + calendarData.owner + calendarData.name);
      Calendar.$subscribe(calendarData.owner, calendarData.name).then(function(data) {
         $mdToast.show(
           $mdToast.simple()
             .content(l('Successfully subscribed to calendar'))
             .position('top right')
             .hideDelay(3000));
      });
    }

  }

  angular
    .module('SOGo.SchedulerUI')
    .controller('CalendarsController', CalendarsController);
})();
